# CRM B2B | Casa de Sucos Mix

MVP comercial para cadastrar leads, acompanhar o funil, organizar follow-ups e preparar mensagens para envio manual pelo WhatsApp Web.

## Pré-requisitos

- Node.js 18 ou superior
- Um projeto no [Supabase](https://supabase.com)

## Configuração

1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/202607080001_crm_b2b.sql` e execute.
2. Em **Authentication > Users**, crie o primeiro usuário com e-mail e senha. O perfil será criado automaticamente.
3. Copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

4. Instale e rode:

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` e entre com o usuário criado no Supabase.

## Build de produção

```bash
npm run build
npm run preview
```

## Fluxo principal

1. Cadastre um lead informando obrigatoriamente a origem.
2. Abra o lead, copie a mensagem sugerida e abra o WhatsApp Web.
3. Cole e envie manualmente no WhatsApp.
4. Volte ao CRM e clique em **Marcar contato enviado**. A interação e a próxima data serão registradas.
5. Use as ações comerciais ou arraste o card no Kanban para avançar o lead.

O CRM nunca envia mensagens automaticamente e não inclui o texto no link do WhatsApp.

## Regras implementadas

- Login por e-mail/senha com Supabase Auth e RLS.
- Dashboard, Kanban, lista com filtros, alertas, degustações, propostas e relatórios.
- Cadências pré-degustação, pós-degustação e pós-proposta.
- Alertas de atraso, follow-up hoje, novo lead parado, lead parado e proposta sem retorno.
- Histórico de contatos e mudanças comerciais.
- Etapas finais encerram alertas e follow-ups.
- Telefone brasileiro normalizado para o WhatsApp Web.

Os dois leads de exemplo estão comentados no final da migration e também podem ser cadastrados pelo formulário.
