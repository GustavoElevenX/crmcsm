-- Usa o relógio do servidor para o primeiro follow-up de novos leads.
alter table public.leads
alter column proximo_followup_em set default now();

-- Corrige leads antigos afetados por diferença entre o relógio do navegador e do Supabase.
update public.leads
set proximo_followup_em = created_at
where etapa_cadencia = 'pre_degustacao'
  and indice_followup = 0
  and (
    proximo_followup_em is null
    or proximo_followup_em < created_at
  );
