-- Garante que leads ainda sem contato usem exatamente o created_at do Supabase como D0.
update public.leads
set proximo_followup_em = created_at
where etapa_cadencia = 'pre_degustacao'
  and indice_followup = 0
  and ultimo_contato_em is null;
