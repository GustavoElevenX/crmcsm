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

-- Remove a constraint parcial caso uma execução anterior tenha chegado a criá-la.
alter table public.leads
drop constraint if exists telefone_tamanho_brasil;

-- Valida e normaliza somente telefones novos ou alterados. Registros legados
-- inválidos continuam editáveis em outras ações até que o telefone seja corrigido.
create or replace function public.normalize_and_validate_lead_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_phone text;
begin
  normalized_phone := regexp_replace(new.telefone, '[^0-9]', '', 'g');

  if normalized_phone ~ '^55[0-9]{10,11}$' then
    normalized_phone := substring(normalized_phone from 3);
  end if;

  if char_length(normalized_phone) not between 10 and 11 then
    raise exception using
      errcode = '23514',
      constraint = 'telefone_tamanho_brasil',
      message = 'Telefone deve ter 10 ou 11 dígitos, sem o código do país.';
  end if;

  new.telefone := normalized_phone;
  return new;
end;
$$;

drop trigger if exists normalize_lead_phone_before_write on public.leads;
create trigger normalize_lead_phone_before_write
before insert or update of telefone on public.leads
for each row execute function public.normalize_and_validate_lead_phone();
