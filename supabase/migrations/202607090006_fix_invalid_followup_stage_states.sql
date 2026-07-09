-- Corrige leads que estão em etapas posteriores, mas ainda não tiveram nenhum contato enviado.
update public.leads l
set
  stage_id = s.id,
  status = s.name
from public.crm_stages s
where s.slug = 'novo_lead'
  and l.etapa_cadencia = 'pre_degustacao'
  and l.indice_followup = 0
  and l.ultimo_contato_em is null
  and l.stage_id in (
    select id
    from public.crm_stages
    where slug in ('sem_resposta', 'primeiro_contato_enviado')
  );

-- Leads criados após o expediente recebem o primeiro contato no dia seguinte às 09h.
update public.leads
set proximo_followup_em = (
  date_trunc('day', created_at at time zone 'America/Sao_Paulo')
  + interval '1 day 9 hours'
) at time zone 'America/Sao_Paulo'
where etapa_cadencia = 'pre_degustacao'
  and indice_followup = 0
  and ultimo_contato_em is null
  and extract(hour from created_at at time zone 'America/Sao_Paulo') >= 18;

-- Leads criados antes do expediente recebem o primeiro contato às 09h do mesmo dia.
update public.leads
set proximo_followup_em = (
  date_trunc('day', created_at at time zone 'America/Sao_Paulo')
  + interval '9 hours'
) at time zone 'America/Sao_Paulo'
where etapa_cadencia = 'pre_degustacao'
  and indice_followup = 0
  and ultimo_contato_em is null
  and extract(hour from created_at at time zone 'America/Sao_Paulo') < 9;
