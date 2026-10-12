# Teste controlado — OpenAI + Supabase

**Estado:** preparado em `painel/index.html`, branch `feature/whatsapp-legado-mvp`. Não está publicado. Não modifica `main` nem a versão 1.0.

## Procedimento

1. Utilizar uma conta Supabase **descartável**, com e-mail confirmado, que não tenha memórias pessoais ou perfil importado. **Não usar a conta do titular real.**
2. Publicar o painel em ambiente HTTPS válido com origem autorizada no CORS da função `import-chatgpt` (atualmente a origem permitida é `https://legadodigitalapp.com.br`). Não contornar TLS nem colocar tokens em links ou prints.
3. Fazer login com a conta de teste e escolher **Teste IA**.
4. Confirmar a opção de teste fictício e clicar **Testar conexão OpenAI + Supabase**.
5. O painel envia uma mensagem fictícia usando o JWT da sessão, chama `import-chatgpt` e então consulta `legacy_personalities` via RLS para verificar se o perfil foi gravado.
6. Validar HTTP, gravação, custos e ausência de acesso cruzado entre contas. Depois, eliminar a conta e os dados de teste pelos meios administrativos adequados.

## Avisos

- Sem HTTPS válido e publicação do painel, não é seguro nem possível completar o teste no navegador.
- A função exige autenticação, mas ainda não passou por auditoria de segurança, testes de concorrência, limites de gastos e validação do modelo.
- O `gpt-4.1-mini` ter respondido no Playground comprova a API do projeto OpenAI, mas não a integração Supabase.
- Nunca copiar JWT de usuário, service role, senha ou OPENAI_API_KEY para o chat ou para o GitHub.
- Só liberar importação de arquivos reais após tratamento robusto de privacidade, dados sensíveis, limites de tamanho, retenção e revogação.
