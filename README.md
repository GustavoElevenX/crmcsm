# CRM B2B | Casa de Sucos Mix

CRM interno para cadastrar leads, acompanhar o funil comercial e organizar contatos manuais pelo WhatsApp Web.

## Tecnologia e escopo

- React, TypeScript e Vite
- Supabase como banco de dados
- Supabase Auth com e-mail e senha
- Kanban com `@dnd-kit`
- Datas com `date-fns`

O projeto não usa Firebase e não envia mensagens automaticamente. Ele prepara o texto, copia para a área de transferência e abre o WhatsApp Web; o envio continua sendo manual.

Crie todos os usuários em **Supabase > Authentication > Users**. Um usuário criado apenas no Firebase não funciona neste CRM, pois o login e as regras de acesso usam exclusivamente o Supabase Auth.

## Instalação

1. Instale Node.js 18 ou superior.
2. Crie um projeto no Supabase.
3. No **SQL Editor**, execute as migrations nesta ordem:

   - `supabase/migrations/202607080001_crm_b2b.sql`
   - `supabase/migrations/202607090001_backfill_existing_profiles.sql`
   - `supabase/migrations/202607090002_fix_followup_dates.sql`
   - `supabase/migrations/202607090003_unique_meta_leads.sql`
   - `supabase/migrations/202607090004_normalize_initial_followups.sql`

4. Em **Authentication > Users**, crie o primeiro usuário com e-mail e senha.
5. Copie `.env.example` para `.env` e preencha as credenciais públicas do projeto:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

6. Instale as dependências e inicie:

```bash
npm install
npm run dev
```

7. Abra `http://localhost:5173` e entre com o usuário criado.

## Fluxo da vendedora

1. Cadastre o lead e informe obrigatoriamente a origem.
2. Confira o follow-up atual na tabela ou abra o atendimento.
3. Clique em **Copiar mensagem**.
4. Clique em **Abrir WhatsApp Web**.
5. Cole a mensagem e envie manualmente.
6. Volte ao CRM e clique em **Marcar contato como enviado**.
7. Se houver resposta, marque **Lead respondeu**.
8. Agende a degustação informando data, hora e vendedor externo.
9. Registre a degustação realizada, a proposta e a negociação.
10. Finalize como **Fechado**, **Perdido** ou **Pausado**.

## Regras principais

- Lead novo recebe follow-up D0 usando o relógio do Supabase.
- Follow-ups são classificados pelo dia comercial, não pelo minuto.
- O primeiro envio move para `1º contato enviado`; os seguintes, sem resposta, movem para `Sem resposta`.
- Degustação realizada inicia automaticamente a cadência pós-degustação.
- IDs de leads do Meta Ads não podem ser duplicados.
- Etapas finais encerram alertas e cadências.
- Toda alteração relevante é registrada no histórico.
- Cadastros podem ser editados no detalhe do lead.

## Build de produção

```bash
npm run build
npm run preview
```
