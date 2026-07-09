create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'vendedora' check (role in ('admin', 'vendedora', 'vendedor_externo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  position int not null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.crm_stages (name, slug, position, is_final) values
('Novo lead', 'novo_lead', 1, false),
('1º contato enviado', 'primeiro_contato_enviado', 2, false),
('Sem resposta', 'sem_resposta', 3, false),
('Respondeu', 'respondeu', 4, false),
('Degustação agendada', 'degustacao_agendada', 5, false),
('Degustação realizada', 'degustacao_realizada', 6, false),
('Proposta enviada', 'proposta_enviada', 7, false),
('Pedido teste / Negociação', 'pedido_teste_negociacao', 8, false),
('Fechado', 'fechado', 9, true),
('Perdido', 'perdido', 10, true),
('Pausado', 'pausado', 11, true)
on conflict (slug) do update set name = excluded.name, position = excluded.position, is_final = excluded.is_final;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nome_responsavel text not null,
  telefone text not null,
  email text,
  empresa text not null,
  segmento text,
  produto_interesse text,
  bairro text,
  endereco text,
  origem text not null check (origem in (
    'Trafego Pago - Formulario Meta Ads', 'Link da Bio', 'Instagram Direct', 'WhatsApp Organico',
    'Indicacao', 'Prospecao Ativa', 'Cliente Antigo', 'Outro'
  )),
  meta_lead_id text,
  campanha text,
  conjunto_anuncio text,
  anuncio text,
  link_origem text,
  indicado_por text,
  responsavel_prospeccao text,
  canal_prospeccao text,
  data_envio_formulario timestamptz,
  interesse_degustacao text,
  observacao text,
  stage_id uuid references public.crm_stages(id),
  status text not null default 'Novo lead',
  temperatura text not null default 'morno' check (temperatura in ('frio', 'morno', 'quente')),
  etapa_cadencia text not null default 'pre_degustacao' check (etapa_cadencia in ('pre_degustacao', 'pos_degustacao', 'pos_proposta', 'manual', 'encerrado')),
  indice_followup int not null default 0,
  ultimo_contato_em timestamptz,
  proximo_followup_em timestamptz,
  ultimo_movimento_em timestamptz not null default now(),
  degustacao_agendada_em timestamptz,
  degustacao_realizada_em timestamptz,
  vendedor_externo text,
  feedback_degustacao text,
  proposta_enviada_em timestamptz,
  valor_proposta numeric(12,2),
  quantidade_sugerida text,
  fechado_em timestamptz,
  valor_primeiro_pedido numeric(12,2),
  motivo_perda text,
  owner_id uuid references public.profiles(id),
  constraint telefone_minimo check (char_length(regexp_replace(telefone, '[^0-9]', '', 'g')) >= 10)
);

create index if not exists idx_leads_stage_id on public.leads(stage_id);
create index if not exists idx_leads_origem on public.leads(origem);
create index if not exists idx_leads_proximo_followup on public.leads(proximo_followup_em);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_owner_id on public.leads(owner_id);

create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null check (type in ('whatsapp', 'ligacao', 'degustacao', 'proposta', 'observacao', 'mudanca_status')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound', 'internal')),
  message text,
  followup_index int,
  created_by uuid references public.profiles(id)
);
create index if not exists idx_lead_interactions_lead_id on public.lead_interactions(lead_id);

create table if not exists public.followup_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadencia text not null check (cadencia in ('pre_degustacao', 'pos_degustacao', 'pos_proposta')),
  followup_index int not null,
  offset_days int not null,
  template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cadencia, followup_index)
);

insert into public.followup_templates (name, cadencia, followup_index, offset_days, template) values
('1º contato - D0', 'pre_degustacao', 0, 0, 'Oi, {{nome}}, tudo bem? Aqui é {{vendedora}}, da Casa de Sucos Mix. Vi que você demonstrou interesse em {{produto_interesse}} para {{empresa}}, em {{bairro}}. Trabalhamos com fornecimento de sucos para estabelecimentos e também podemos agendar uma degustação gratuita para você conhecer melhor. Faz sentido eu te passar as informações e já ver um melhor dia para a degustação?'),
('2º contato - D+1', 'pre_degustacao', 1, 1, 'Oi, {{nome}}. Passando só para confirmar se você conseguiu ver minha mensagem sobre os sucos para {{empresa}}. Pela resposta do formulário, acredito que {{produto_interesse}} pode fazer sentido para o seu negócio. Posso te mandar as condições iniciais por aqui ou você prefere que eu já veja um horário para uma degustação gratuita?'),
('3º contato - D+3', 'pre_degustacao', 2, 3, 'Oi, {{nome}}, tudo certo? Como você informou que trabalha com {{segmento}}, normalmente o que mais funciona é ter um produto pronto para venda/consumo rápido, com boa saída e fácil reposição. No seu caso, pensei em começar te mostrando o {{produto_interesse}}. Você prefere avaliar primeiro uma proposta ou agendar a degustação para conhecer o produto antes?'),
('4º contato - D+7', 'pre_degustacao', 3, 7, 'Oi, {{nome}}. Estou organizando a rota de degustações dessa semana e lembrei do seu cadastro para {{empresa}}, em {{bairro}}. Ainda consigo tentar encaixar uma degustação gratuita para você conhecer os sucos. Qual horário costuma ser melhor para você: manhã ou tarde?'),
('5º contato - D+14', 'pre_degustacao', 4, 14, 'Oi, {{nome}}. Talvez a correria tenha atrapalhado nosso contato. Para eu não ficar te chamando sem necessidade, me diz só uma coisa: hoje o seu maior interesse seria em preço, degustação, quantidade mínima ou sabores disponíveis? Se preferir, pode me responder só com uma dessas opções que eu te mando direto.'),
('6º contato - D+21', 'pre_degustacao', 5, 21, 'Oi, {{nome}}. Último retorno sobre o formulário que você preencheu com a Casa de Sucos Mix. Como não consegui falar com você, vou pausar seu atendimento por aqui. Mas, se ainda fizer sentido avaliar os sucos para {{empresa}}, me responde com "quero informações" que eu te mando tudo de forma objetiva.'),
('Pós-degustação 1 - mesmo dia', 'pos_degustacao', 0, 0, 'Oi, {{nome}}, tudo bem? Passando para saber o que você achou da degustação dos sucos. Pelo perfil da {{empresa}}, acredito que dá para começar com um pedido teste, sem precisar assumir grande volume logo de início. Quer que eu te mande uma sugestão inicial de sabores e quantidades?'),
('Pós-degustação 2 - D+1', 'pos_degustacao', 1, 1, 'Oi, {{nome}}. Pensei em uma entrada mais simples para você testar a saída dos sucos: começar com {{quantidade_sugerida}} de {{produto_interesse}}, nos sabores com maior aceitação. Se fizer sentido, eu já te mando a proposta fechada por aqui.'),
('Pós-degustação 3 - D+3', 'pos_degustacao', 2, 3, 'Oi, {{nome}}. Sobre os sucos, ficou alguma dúvida em relação a preço, entrega, sabores ou quantidade mínima? Me fala o principal ponto que eu te respondo direto.'),
('Pós-degustação 4 - D+7', 'pos_degustacao', 3, 7, 'Oi, {{nome}}. Ainda faz sentido testar os sucos na {{empresa}} essa semana? Posso te passar uma sugestão de pedido inicial mais enxuta para você validar com pouco risco.'),
('Pós-degustação 5 - D+14', 'pos_degustacao', 4, 14, 'Oi, {{nome}}. Vou pausar seu atendimento por enquanto para não ficar te incomodando. Mas se ainda quiser testar os sucos da Casa de Sucos Mix no seu estabelecimento, me responde com "pedido teste" que eu te mando uma sugestão simples para começar.'),
('Pós-proposta 1 - D+1', 'pos_proposta', 0, 1, 'Oi, {{nome}}, tudo bem? Passando para saber se você conseguiu avaliar a proposta dos sucos para {{empresa}}. Posso te ajudar com alguma dúvida sobre sabores, quantidade, entrega ou forma de começar?'),
('Pós-proposta 2 - D+3', 'pos_proposta', 1, 3, 'Oi, {{nome}}. Para facilitar, podemos começar com um pedido teste mais enxuto e ir ajustando conforme a saída dos produtos. Faz sentido eu te mandar uma sugestão inicial mais simples para começar?'),
('Pós-proposta 3 - D+7', 'pos_proposta', 2, 7, 'Oi, {{nome}}. Ainda faz sentido testar os sucos na {{empresa}}? Se quiser, me responde com "pedido teste" que eu te mando uma sugestão objetiva para começar com pouco risco.')
on conflict (cadencia, followup_index) do update
set name = excluded.name, offset_days = excluded.offset_days, template = excluded.template, active = true;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Também cria perfis para usuários que já existiam antes desta migration.
insert into public.profiles (id, full_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.crm_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_interactions enable row level security;
alter table public.followup_templates enable row level security;

drop policy if exists "authenticated read profiles" on public.profiles;
create policy "authenticated read profiles" on public.profiles for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated manage profiles own" on public.profiles;
create policy "authenticated manage profiles own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "authenticated read stages" on public.crm_stages;
create policy "authenticated read stages" on public.crm_stages for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated read templates" on public.followup_templates;
create policy "authenticated read templates" on public.followup_templates for select using (auth.role() = 'authenticated');
drop policy if exists "authenticated manage leads" on public.leads;
create policy "authenticated manage leads" on public.leads for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated manage interactions" on public.lead_interactions;
create policy "authenticated manage interactions" on public.lead_interactions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Opcional: descomente para inserir os dois leads de exemplo depois de criar um usuário.
-- O stage_id é preenchido automaticamente pela subconsulta; owner_id pode permanecer nulo.
-- insert into public.leads (nome_responsavel, telefone, email, empresa, segmento, produto_interesse, bairro, interesse_degustacao, origem, meta_lead_id, stage_id, proximo_followup_em)
-- select 'Lenny', '+5598981631934', 'mariadador29@gmail.com', 'Sai a quanto e quais sabores', 'Padaria', 'Sucos de 300ml', 'No filipinho', 'Quero receber mais informações primeiro', 'Trafego Pago - Formulario Meta Ads', '2148078805758066', id, now() from public.crm_stages where slug = 'novo_lead';
-- insert into public.leads (nome_responsavel, telefone, email, empresa, segmento, produto_interesse, bairro, interesse_degustacao, origem, meta_lead_id, stage_id, proximo_followup_em)
-- select 'Ademir', '+5598984973222', 'ademirferraz80@hotmail.com', 'Dom Ferraz Pizzaria Delivery', 'Outro', 'Sucos de 1 litro', 'Maiobão', 'Quero receber mais informações primeiro', 'Trafego Pago - Formulario Meta Ads', '2148078805758066', id, now() from public.crm_stages where slug = 'novo_lead';
