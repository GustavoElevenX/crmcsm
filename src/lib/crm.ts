import { addDays, differenceInHours, isBefore, isSameDay, subDays } from 'date-fns';
import { supabase } from './supabase';
import type { AlertStatus, FollowupTemplate, Lead, Stage } from '../types';

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string };

function getFriendlyDatabaseError(error: DatabaseError, fallback: string) {
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  if (error.code === '23514' || text.includes('telefone_minimo')) return new Error('Informe um telefone válido com DDD.');
  if (error.code === '23505') return new Error('Já existe um registro com esses dados.');
  if (error.code === '23502') return new Error('Preencha todos os campos obrigatórios.');
  if (error.code === '23503') return new Error('Não foi possível vincular este registro. Atualize a página e tente novamente.');
  if (error.code === '42501' || text.includes('row-level security')) return new Error('Sua sessão não permite esta ação. Saia, entre novamente e tente outra vez.');
  if (text.includes('jwt') || text.includes('not authenticated')) return new Error('Sua sessão expirou. Entre novamente para continuar.');
  if (text.includes('failed to fetch') || text.includes('network')) return new Error('Falha de conexão. Verifique sua internet e tente novamente.');
  return new Error(fallback);
}

async function getCurrentProfileId() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const fullName =
    (typeof auth.user.user_metadata?.full_name === 'string' && auth.user.user_metadata.full_name.trim())
    || auth.user.email?.split('@')[0]
    || 'Usuário';
  const { error: profileError } = await supabase.from('profiles').upsert(
    { id: auth.user.id, full_name: fullName },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  return profileError ? null : auth.user.id;
}

export function applyTemplate(template: string, lead: Lead, currentUserName?: string) {
  return template
    .replaceAll('{{nome}}', lead.nome_responsavel || 'tudo bem')
    .replaceAll('{{empresa}}', lead.empresa || 'sua empresa')
    .replaceAll('{{produto_interesse}}', lead.produto_interesse || 'nossos sucos')
    .replaceAll('{{bairro}}', lead.bairro || 'sua região')
    .replaceAll('{{segmento}}', lead.segmento || 'seu segmento')
    .replaceAll('{{vendedora}}', currentUserName || 'a equipe')
    .replaceAll('{{quantidade_sugerida}}', lead.quantidade_sugerida || 'um pedido teste');
}

export function formatPhoneForWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function getWhatsAppUrl(lead: Lead) {
  return `https://web.whatsapp.com/send?phone=${formatPhoneForWhatsApp(lead.telefone)}`;
}

export function getAlertStatus(lead: Lead): AlertStatus {
  if (lead.crm_stages?.is_final || lead.etapa_cadencia === 'encerrado') return 'em_dia';
  const now = new Date();
  const next = lead.proximo_followup_em ? new Date(lead.proximo_followup_em) : null;
  if (next && isBefore(next, now)) return 'atrasado';
  if (lead.crm_stages?.slug === 'novo_lead' && differenceInHours(now, new Date(lead.created_at)) > 2) return 'novo_lead_parado';
  if (lead.crm_stages?.slug === 'proposta_enviada' && lead.proposta_enviada_em && isBefore(new Date(lead.proposta_enviada_em), subDays(now, 3))) {
    const hasLaterInteraction = lead.lead_interactions?.some((item) => item.type !== 'proposta' && new Date(item.created_at) > new Date(lead.proposta_enviada_em!));
    if (!hasLaterInteraction) return 'proposta_sem_retorno';
  }
  if (lead.ultimo_movimento_em && isBefore(new Date(lead.ultimo_movimento_em), subDays(now, 3))) return 'lead_parado';
  if (next && isSameDay(next, now)) return 'hoje';
  return 'em_dia';
}

export async function getCurrentFollowupTemplate(lead: Lead): Promise<FollowupTemplate | null> {
  if (lead.etapa_cadencia === 'manual' || lead.etapa_cadencia === 'encerrado') return null;
  const { data, error } = await supabase
    .from('followup_templates')
    .select('*')
    .eq('cadencia', lead.etapa_cadencia)
    .eq('followup_index', lead.indice_followup)
    .eq('active', true)
    .maybeSingle();
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível carregar a mensagem deste follow-up.');
  return data;
}

export async function copyCurrentMessage(lead: Lead, currentUserName?: string) {
  const template = await getCurrentFollowupTemplate(lead);
  if (!template) throw new Error('Não há mensagem automática para esta etapa.');
  await navigator.clipboard.writeText(applyTemplate(template.template, lead, currentUserName));
}

async function getStage(stageSlug: string): Promise<Stage> {
  const { data, error } = await supabase.from('crm_stages').select('*').eq('slug', stageSlug).single();
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível localizar a etapa comercial.');
  return data;
}

async function addInteraction(leadId: string, type: string, direction: string, message: string, followupIndex?: number) {
  const profileId = await getCurrentProfileId();
  const { error } = await supabase.from('lead_interactions').insert({
    lead_id: leadId,
    type,
    direction,
    message,
    followup_index: followupIndex,
    created_by: profileId,
  });
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível registrar esta interação.');
}

async function updateLead(leadId: string, changes: Record<string, unknown>) {
  const { error } = await supabase.from('leads').update({ ...changes, ultimo_movimento_em: new Date().toISOString() }).eq('id', leadId);
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível atualizar este lead.');
}

export async function moveLeadToStage(leadId: string, stageSlug: string) {
  const stage = await getStage(stageSlug);
  const changes: Record<string, unknown> = { stage_id: stage.id, status: stage.name };
  if (stage.is_final) Object.assign(changes, { etapa_cadencia: 'encerrado', proximo_followup_em: null });
  if (stageSlug === 'degustacao_realizada') changes.degustacao_realizada_em = new Date().toISOString();
  if (stageSlug === 'proposta_enviada') Object.assign(changes, { proposta_enviada_em: new Date().toISOString(), etapa_cadencia: 'pos_proposta', indice_followup: 0, proximo_followup_em: addDays(new Date(), 1).toISOString() });
  if (stageSlug === 'fechado') changes.fechado_em = new Date().toISOString();
  await updateLead(leadId, changes);
  await addInteraction(leadId, 'mudanca_status', 'internal', `Movido para ${stage.name}`);
}

export async function markContactSent(lead: Lead, currentUserName?: string) {
  const current = await getCurrentFollowupTemplate(lead);
  if (!current) throw new Error('Não há follow-up disponível para marcar.');
  const message = applyTemplate(current.template, lead, currentUserName);
  await addInteraction(lead.id, 'whatsapp', 'outbound', message, current.followup_index);
  const nextIndex = current.followup_index + 1;
  const { data: next, error } = await supabase
    .from('followup_templates').select('*')
    .eq('cadencia', current.cadencia).eq('followup_index', nextIndex).eq('active', true).maybeSingle();
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível calcular o próximo follow-up.');
  const now = new Date();
  if (next) {
    await updateLead(lead.id, {
      ultimo_contato_em: now.toISOString(),
      indice_followup: nextIndex,
      proximo_followup_em: addDays(now, next.offset_days - current.offset_days).toISOString(),
      ...(lead.crm_stages?.slug === 'novo_lead' ? { stage_id: (await getStage('primeiro_contato_enviado')).id, status: '1º contato enviado' } : {}),
    });
  } else {
    const paused = await getStage('pausado');
    await updateLead(lead.id, {
      ultimo_contato_em: now.toISOString(), indice_followup: nextIndex, proximo_followup_em: null,
      etapa_cadencia: 'encerrado', stage_id: paused.id, status: 'Pausado',
    });
  }
}

export async function markLeadResponded(leadId: string) {
  const stage = await getStage('respondeu');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, etapa_cadencia: 'manual', proximo_followup_em: null });
  await addInteraction(leadId, 'mudanca_status', 'inbound', 'Lead respondeu');
}

export async function scheduleDegustation(leadId: string, date: Date) {
  const stage = await getStage('degustacao_agendada');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, degustacao_agendada_em: date.toISOString(), etapa_cadencia: 'manual', proximo_followup_em: null });
  await addInteraction(leadId, 'degustacao', 'internal', `Degustação agendada para ${date.toLocaleString('pt-BR')}`);
}

export async function markDegustationDone(leadId: string) {
  const stage = await getStage('degustacao_realizada');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, degustacao_realizada_em: new Date().toISOString(), etapa_cadencia: 'manual', proximo_followup_em: null });
  await addInteraction(leadId, 'degustacao', 'internal', 'Degustação realizada');
}

export async function startPostDegustation(leadId: string) {
  await updateLead(leadId, { etapa_cadencia: 'pos_degustacao', indice_followup: 0, proximo_followup_em: new Date().toISOString() });
  await addInteraction(leadId, 'mudanca_status', 'internal', 'Cadência pós-degustação iniciada');
}

export async function markProposalSent(leadId: string, proposalValue?: number) {
  const stage = await getStage('proposta_enviada');
  await updateLead(leadId, {
    stage_id: stage.id, status: stage.name, proposta_enviada_em: new Date().toISOString(),
    valor_proposta: proposalValue ?? null, etapa_cadencia: 'pos_proposta', indice_followup: 0,
    proximo_followup_em: addDays(new Date(), 1).toISOString(),
  });
  await addInteraction(leadId, 'proposta', 'outbound', proposalValue ? `Proposta enviada: R$ ${proposalValue.toFixed(2)}` : 'Proposta enviada');
}

export async function closeLead(leadId: string, firstOrderValue?: number) {
  const stage = await getStage('fechado');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, fechado_em: new Date().toISOString(), valor_primeiro_pedido: firstOrderValue ?? null, etapa_cadencia: 'encerrado', proximo_followup_em: null });
  await addInteraction(leadId, 'mudanca_status', 'internal', firstOrderValue ? `Fechado: R$ ${firstOrderValue.toFixed(2)}` : 'Lead fechado');
}

export async function loseLead(leadId: string, reason: string) {
  const stage = await getStage('perdido');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, motivo_perda: reason, etapa_cadencia: 'encerrado', proximo_followup_em: null });
  await addInteraction(leadId, 'mudanca_status', 'internal', `Perdido: ${reason}`);
}

export async function pauseLead(leadId: string) {
  await moveLeadToStage(leadId, 'pausado');
}

export async function createLead(payload: Record<string, unknown>) {
  const stage = await getStage('novo_lead');
  const ownerId = await getCurrentProfileId();
  const sanitizedPayload = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]),
  );
  const { error } = await supabase.from('leads').insert({
    ...sanitizedPayload, stage_id: stage.id, status: stage.name, owner_id: ownerId,
    etapa_cadencia: 'pre_degustacao', indice_followup: 0, proximo_followup_em: new Date().toISOString(),
  });
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível cadastrar o lead. Tente novamente.');
}
