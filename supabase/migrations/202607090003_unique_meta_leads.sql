-- Preserva apenas o primeiro ID em duplicidades antigas para permitir o índice único.
with ranked_duplicates as (
  select
    id,
    meta_lead_id,
    row_number() over (partition by meta_lead_id order by created_at, id) as duplicate_position
  from public.leads
  where meta_lead_id is not null
)
update public.leads as lead
set
  observacao = concat_ws(
    E'\n',
    nullif(lead.observacao, ''),
    'ID Meta duplicado removido durante saneamento: ' || lead.meta_lead_id
  ),
  meta_lead_id = null
from ranked_duplicates
where lead.id = ranked_duplicates.id
  and ranked_duplicates.duplicate_position > 1;

create unique index if not exists idx_leads_meta_lead_id_unique
on public.leads(meta_lead_id)
where meta_lead_id is not null;
