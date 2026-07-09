-- Remove caracteres não numéricos de telefones antigos.
update public.leads
set telefone = regexp_replace(telefone, '[^0-9]', '', 'g')
where telefone is not null;

-- Remove o código do país 55 de números brasileiros com DDD.
update public.leads
set telefone = substring(telefone from 3)
where telefone ~ '^55[0-9]{10,11}$';

-- Acelera a verificação de possíveis duplicidades por telefone.
create index if not exists idx_leads_telefone on public.leads(telefone);

-- Garante telefone brasileiro sem código do país.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'telefone_tamanho_brasil'
  ) then
    alter table public.leads
    add constraint telefone_tamanho_brasil
    check (char_length(regexp_replace(telefone, '[^0-9]', '', 'g')) between 10 and 11);
  end if;
end $$;
