Pod::Spec.new do |s|
  s.name = 'LegadoAppleBilling'
  s.version = '1.0.0'
  s.summary = 'StoreKit 2 purchases for Legado Digital'
  s.license = { :type => 'MIT' }
  s.homepage = 'https://legadodigitalapp.com.br'
  s.author = 'Legado Digital'
  s.source = { :git => 'https://github.com/22gabriel-ops/legado-digital.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '16.0'
  s.dependency 'Capacitor'
  s.frameworks = 'StoreKit'
  s.swift_version = '5.9'
end
