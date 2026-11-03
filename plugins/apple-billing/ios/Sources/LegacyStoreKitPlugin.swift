import Foundation
import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(LegacyStoreKitPlugin)
public class LegacyStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LegacyStoreKitPlugin"
    public let jsName = "LegacyStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]
    private let plus = "br.com.meulegado.plus.mensal"
    private var listener: Task<Void, Never>?
    private var unfinished: [UInt64: Transaction] = [:]

    public override func load() {
        listener = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                guard let self = self, case .verified(let transaction) = result,
                      transaction.productID == self.plus else { continue }
                self.unfinished[transaction.id] = transaction
                self.notifyListeners("transaction", data: ["transactionId": String(transaction.id)], retainUntilConsumed: true)
            }
        }
    }
    deinit { listener?.cancel() }

    @objc func products(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let products = try await Product.products(for: [plus])
                call.resolve(["products": products.map { ["id": $0.id, "price": $0.displayPrice] }])
            } catch { call.reject("Não foi possível consultar o preço na App Store.") }
        }
    }
    @objc func purchase(_ call: CAPPluginCall) {
        guard let rawOwner = call.getString("owner"), let owner = UUID(uuidString: rawOwner) else {
            call.reject("Entre na sua conta antes de assinar."); return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [plus]).first else {
                    call.reject("Assinatura indisponível na App Store."); return
                }
                switch try await product.purchase(options: [.appAccountToken(owner)]) {
                case .success(let result):
                    guard case .verified(let transaction) = result else {
                        call.reject("A Apple não confirmou a autenticidade da compra."); return
                    }
                    unfinished[transaction.id] = transaction
                    call.resolve(["status": "purchased", "transactionId": String(transaction.id), "environment": environment(transaction)])
                case .pending: call.resolve(["status": "pending"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.reject("Estado de compra desconhecido.")
                }
            } catch { call.reject("Não foi possível concluir a compra na App Store.") }
        }
    }
    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do { try await AppStore.sync(); await collect(call) }
            catch { call.reject("Não foi possível restaurar as compras.") }
        }
    }
    @objc func pending(_ call: CAPPluginCall) {
        Task { @MainActor in await collect(call) }
    }
    @MainActor private func collect(_ call: CAPPluginCall) async {
        var transactions: [String: [String: String]] = [:]
        for await result in Transaction.unfinished {
            if case .verified(let t) = result, t.productID == plus {
                unfinished[t.id] = t; transactions[String(t.id)] = ["transactionId": String(t.id), "environment": environment(t)]
            }
        }
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == plus {
                unfinished[t.id] = t; transactions[String(t.id)] = ["transactionId": String(t.id), "environment": environment(t)]
            }
        }
        call.resolve(["transactions": Array(transactions.values)])
    }
    private func environment(_ transaction: Transaction) -> String {
        if #available(iOS 16.0, *) { return transaction.environment == .sandbox ? "Sandbox" : "Production" }
        return "Production"
    }
    @objc func finish(_ call: CAPPluginCall) {
        guard let raw = call.getString("transactionId"), let id = UInt64(raw) else {
            call.reject("Identificador inválido."); return
        }
        Task { @MainActor in
            if let transaction = unfinished[id] {
                await transaction.finish(); unfinished.removeValue(forKey: id)
            }
            call.resolve()
        }
    }
}
