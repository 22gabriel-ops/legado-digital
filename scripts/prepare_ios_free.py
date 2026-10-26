#!/usr/bin/env python3
"""Prepare free-only iOS UI without changing the website.
This is a release preparation step; paid entitlement enforcement must also be verified server-side.
"""
from pathlib import Path
import re

p=Path("web/index.html")
s=p.read_text(encoding="utf-8")
def replace_once(old,new):
    global s
    if s.count(old)!=1: raise SystemExit(f"Expected exactly one match: {old[:80]!r}; got {s.count(old)}")
    s=s.replace(old,new,1)

replace_once('No Grátis e no Plus, apenas o titular verificado interage com seu Legado.',
             'O acesso ao WhatsApp está sujeito à disponibilidade do serviço.')
replace_once('<p><a href="#subscription-card" id="view-plans-link">Ver os três planos e condições →</a></p>',
             '<p><a href="#subscription-card" id="view-plans-link">Entenda o limite gratuito →</a></p>')
replace_once('Assinaturas ainda em preparação.','Sem pagamentos nesta versão.')
start='<div class="card" id="subscription-card">'
end='<div class="card"><h2>Minhas interações 🌳</h2>'
if s.count(start)!=1 or s.count(end)!=1: raise SystemExit("Subscription boundaries not unique")
a=s.index(start);b=s.index(end,a)
s=s[:a]+'''<div class="card" id="subscription-card">
<h2>Meu Legado gratuito 🌳</h2>
<p>Crie seu Legado, converse com a IA e preserve suas memórias gratuitamente.</p>
<p class="muted">São 10 interações mensais incluídas, sem cartão, assinatura ou compras dentro do aplicativo.</p>
</div>
'''+s[b:]
start='<div class="card"><h2>Minhas interações 🌳</h2>'
end='<div class="card"><h2>Guardiões do meu legado</h2>'
if s.count(start)!=1 or s.count(end)!=1: raise SystemExit("Usage boundaries not unique")
a=s.index(start);b=s.index(end,a)
s=s[:a]+'''<div class="card"><h2>Minhas interações 🌳</h2>
<p>Você tem até <strong>10 interações gratuitas por mês</strong>. A franquia renova mensalmente, sem acumular saldo.</p>
<p>Uma interação corresponde a uma mensagem enviada e à resposta do Legado.</p>
<p id="legacy-usage-status" class="muted" role="status">Consultando consumo mensal...</p>
</div>
'''+s[b:]
start='async function loadLegacyPlan(){'
end='// Conversa autenticada integrada à área logada;'
if s.count(start)!=1 or s.count(end)!=1: raise SystemExit("Plan routine boundaries not unique")
a=s.index(start);b=s.index(end,a)
s=s[:a]+'''async function loadLegacyPlan(){
 $('legacy-plan-label').textContent='Grátis — R$ 0/mês';
 $('legacy-plan-desc').textContent='10 interações mensais gratuitas, renovadas automaticamente.';
 try{
  const now=new Date();const month=now.toISOString().slice(0,7)+'-01';
  const usage=await authorized('/rest/v1/legacy_usage_months?select=included_used&month_start=eq.'+month+'&limit=1');
  const used=Number(usage?.[0]?.included_used||0);
  const summary=used+' interações registradas neste mês. Limite gratuito: 10 interações mensais.';
  $('legacy-usage-status').textContent=summary;
  $('chat-quota').textContent=summary;
 }catch{
  $('legacy-usage-status').textContent='Não foi possível consultar o consumo mensal.';
  $('chat-quota').textContent='Consumo indisponível.';
 }
}

'''+s[b:]
# Do not leave paid promotions or purchase links in the packaged iOS entry point.
for forbidden in ('Meu Legado Plus','Meu Legado Exclusivo','subscribe-plus','restore-purchases',
                  'R$ 19,90','R$ 99,90','500 interações por mês'):
    if forbidden in s: raise SystemExit('Still contains paid offer: '+forbidden)
p.write_text(s,encoding="utf-8")
print("iOS free-only UI prepared; paid features still require backend entitlement audit.")
