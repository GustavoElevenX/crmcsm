-- Corrige qualquer lead que ainda está no follow-up inicial,
-- mas ficou preso em etapa posterior por dado antigo ou bug anterior.
-- Regra: se indice_followup = 0, operacionalmente ainda é primeiro contato.

update public.leads l
set
  stage_id = s.id,
  status = s.name,
  ultimo_contato_em = null,
  proximo_followup_em = case
    when extract(hour from l.created_at at time zone 'America/Sao_Paulo') >= 18 then
      (
        date_trunc('day', l.created_at at time zone 'America/Sao_Paulo')
        + interval '1 day 9 hours'
      ) at time zone 'America/Sao_Paulo'
    when extract(hour from l.created_at at time zone 'America/Sao_Paulo') < 9 then
      (
        date_trunc('day', l.created_at at time zone 'America/Sao_Paulo')
        + interval '9 hours'
      ) at time zone 'America/Sao_Paulo'
    else
      l.created_at
  end
from public.crm_stages s
where s.slug = 'novo_lead'
  and l.etapa_cadencia = 'pre_degustacao'
  and l.indice_followup = 0;
