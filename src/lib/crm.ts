import { addDays, differenceInHours, isBefore, isSameDay, startOfDay, subDays } from 'date-fns';
import { supabase } from './supabase';
import type { AlertStatus, FollowupTemplate, Lead, Stage } from '../types';

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string };
export const BUSINESS_FOLLOWUP_HOUR = 9;

export function sameMomentAsCreatedAt(createdAt: string) {
  return new Date(createdAt).toISOString();
}

export function nextCommercialFollowupDate(base: Date, daysToAdd: number) {
  const next = startOfDay(addDays(base, daysToAdd));
  next.setHours(BUSINESS_FOLLOWUP_HOUR, 0, 0, 0);
  return next.toISOString();
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export function normalizePhoneForStorage(phone: string) {
  const digits = normalizePhone(phone);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export function getFinalCadenceChanges() {
  return { etapa_cadencia: 'encerrado' as const, proximo_followup_em: null };
}

export function getPostDegustationChanges(now = new Date()) {
  return {
    etapa_cadencia: 'pos_degustacao' as const,
    indice_followup: 0,
    proximo_followup_em: now.toISOString(),
  };
}

export function getPostProposalChanges(now = new Date()) {
  return {
    etapa_cadencia: 'pos_proposta' as const,
    indice_followup: 0,
    proximo_followup_em: nextCommercialFollowupDate(now, 1),
  };
}

function getFriendlyDatabaseError(error: DatabaseError, fallback: string) {
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  if (error.code === '23514' || text.includes('telefone_minimo')) return new Error('Informe um telefone válido com DDD.');
  if (error.code === '23505' && text.includes('meta_lead_id')) return new Error('Esse lead do formulário já foi cadastrado.');
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
  const digits = normalizePhone(phone);
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function getWhatsAppUrl(lead: Lead) {
  return `https://web.whatsapp.com/send?phone=${formatPhoneForWhatsApp(lead.telefone)}`;
}

export function getFollowupLabel(lead: Lead) {
  if (lead.etapa_cadencia === 'manual') return 'Manual';
  if (lead.etapa_cadencia === 'encerrado') return 'Encerrado';
  const cadenceLabel = {
    pre_degustacao: 'Pré-degustação',
    pos_degustacao: 'Pós-degustação',
    pos_proposta: 'Pós-proposta',
  }[lead.etapa_cadencia];
  return `${cadenceLabel} ${lead.indice_followup + 1}`;
}

export function hasAutomaticFollowup(lead: Lead) {
  const lastIndex = { pre_degustacao: 5, pos_degustacao: 4, pos_proposta: 2 };
  return lead.etapa_cadencia in lastIndex
    && lead.indice_followup <= lastIndex[lead.etapa_cadencia as keyof typeof lastIndex];
}

export function getStageSlugAfterContact(cadence: FollowupTemplate['cadencia'], followupIndex: number) {
  if (cadence !== 'pre_degustacao') return null;
  return followupIndex === 0 ? 'primeiro_contato_enviado' : 'sem_resposta';
}

export function getAlertStatus(lead: Lead): AlertStatus {
  if (lead.crm_stages?.is_final || lead.etapa_cadencia === 'encerrado') {
    return 'em_dia';
  }
  const now = new Date();
  const todayStart = startOfDay(now);
  const next = lead.proximo_followup_em ? new Date(lead.proximo_followup_em) : null;
  const nextDay = next ? startOfDay(next) : null;
  const createdAt = new Date(lead.created_at);
  const isNewLeadWithoutFirstContact =
    lead.crm_stages?.slug === 'novo_lead'
    && lead.etapa_cadencia === 'pre_degustacao'
    && lead.indice_followup === 0
    && !lead.ultimo_contato_em;

  if (isNewLeadWithoutFirstContact) {
    if (differenceInHours(now, createdAt) >= 2) return 'novo_lead_parado';
    return 'hoje';
  }
  if (nextDay) {
    if (isBefore(nextDay, todayStart)) return 'atrasado';
    if (isSameDay(nextDay, todayStart)) return 'hoje';
    return 'em_dia';
  }
  if (lead.crm_stages?.slug === 'proposta_enviada' && lead.proposta_enviada_em && isBefore(new Date(lead.proposta_enviada_em), subDays(now, 3))) {
    const hasLaterInteraction = lead.lead_interactions?.some((item) => item.type !== 'proposta' && new Date(item.created_at) > new Date(lead.proposta_enviada_em!));
    if (!hasLaterInteraction) return 'proposta_sem_retorno';
  }
  if (lead.ultimo_movimento_em && isBefore(new Date(lead.ultimo_movimento_em), subDays(now, 3))) return 'lead_parado';
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
  if (stage.is_final) Object.assign(changes, getFinalCadenceChanges());
  if (stageSlug === 'degustacao_realizada') changes.degustacao_realizada_em = new Date().toISOString();
  if (stageSlug === 'proposta_enviada') Object.assign(changes, { proposta_enviada_em: new Date().toISOString(), ...getPostProposalChanges() });
  if (stageSlug === 'pedido_teste_negociacao') Object.assign(changes, { etapa_cadencia: 'manual', proximo_followup_em: null });
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
  const stageChanges: Record<string, unknown> = {};
  const targetStageSlug = getStageSlugAfterContact(current.cadencia, current.followup_index);
  if (targetStageSlug) {
    const targetStage = await getStage(targetStageSlug);
    stageChanges.stage_id = targetStage.id;
    stageChanges.status = targetStage.name;
  }
  if (next) {
    await updateLead(lead.id, {
      ultimo_contato_em: now.toISOString(),
      indice_followup: nextIndex,
      proximo_followup_em: nextCommercialFollowupDate(now, next.offset_days - current.offset_days),
      ...stageChanges,
    });
  } else {
    const paused = await getStage('pausado');
    await updateLead(lead.id, {
      ultimo_contato_em: now.toISOString(), indice_followup: nextIndex,
      ...getFinalCadenceChanges(), stage_id: paused.id, status: 'Pausado',
    });
  }
}

export async function markLeadResponded(leadId: string) {
  const stage = await getStage('respondeu');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, etapa_cadencia: 'manual', proximo_followup_em: null });
  await addInteraction(leadId, 'mudanca_status', 'inbound', 'Lead respondeu');
}

export async function scheduleDegustation(leadId: string, date: Date, externalSeller?: string, note?: string) {
  const stage = await getStage('degustacao_agendada');
  await updateLead(leadId, {
    stage_id: stage.id, status: stage.name, degustacao_agendada_em: date.toISOString(),
    vendedor_externo: externalSeller || null, etapa_cadencia: 'manual', proximo_followup_em: date.toISOString(),
  });
  const details = [externalSeller ? `Vendedor: ${externalSeller}` : '', note || ''].filter(Boolean).join(' · ');
  await addInteraction(leadId, 'degustacao', 'internal', `Degustação agendada para ${date.toLocaleString('pt-BR')}${details ? ` · ${details}` : ''}`);
}

export async function markDegustationDone(leadId: string) {
  const stage = await getStage('degustacao_realizada');
  await updateLead(leadId, {
    stage_id: stage.id, status: stage.name, degustacao_realizada_em: new Date().toISOString(),
    ...getPostDegustationChanges(),
  });
  await addInteraction(leadId, 'degustacao', 'internal', 'Degustação realizada. Cadência pós-degustação iniciada.');
}

export async function startPostDegustation(leadId: string) {
  await updateLead(leadId, getPostDegustationChanges());
  await addInteraction(leadId, 'mudanca_status', 'internal', 'Cadência pós-degustação iniciada');
}

export async function markProposalSent(leadId: string, proposalValue?: number, suggestedQuantity?: string, note?: string) {
  const stage = await getStage('proposta_enviada');
  await updateLead(leadId, {
    stage_id: stage.id, status: stage.name, proposta_enviada_em: new Date().toISOString(),
    valor_proposta: proposalValue ?? null, quantidade_sugerida: suggestedQuantity || null,
    ...getPostProposalChanges(),
  });
  const details = [proposalValue ? `R$ ${proposalValue.toFixed(2)}` : '', suggestedQuantity || '', note || ''].filter(Boolean).join(' · ');
  await addInteraction(leadId, 'proposta', 'outbound', `Proposta enviada${details ? `: ${details}` : ''}`);
}

export async function closeLead(leadId: string, firstOrderValue?: number, note?: string) {
  const stage = await getStage('fechado');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, fechado_em: new Date().toISOString(), valor_primeiro_pedido: firstOrderValue ?? null, ...getFinalCadenceChanges() });
  const details = [firstOrderValue ? `R$ ${firstOrderValue.toFixed(2)}` : '', note || ''].filter(Boolean).join(' · ');
  await addInteraction(leadId, 'mudanca_status', 'internal', `Lead fechado${details ? `: ${details}` : ''}`);
}

export async function loseLead(leadId: string, reason: string) {
  const stage = await getStage('perdido');
  await updateLead(leadId, { stage_id: stage.id, status: stage.name, motivo_perda: reason, ...getFinalCadenceChanges() });
  await addInteraction(leadId, 'mudanca_status', 'internal', `Perdido: ${reason}`);
}

export async function pauseLead(leadId: string) {
  await moveLeadToStage(leadId, 'pausado');
}

export type PossibleDuplicateLead = {
  id: string;
  nome_responsavel: string;
  empresa: string;
  status: string;
  crm_stages: { name: string; slug: string; is_final: boolean } | null;
};

export async function findActiveLeadsByPhone(phone: string): Promise<PossibleDuplicateLead[]> {
  const phoneDigits = normalizePhoneForStorage(phone);
  if (phoneDigits.length < 10) return [];
  const { data, error } = await supabase
    .from('leads')
    .select('id, nome_responsavel, empresa, status, crm_stages(name, slug, is_final)')
    .eq('telefone', phoneDigits)
    .limit(5);
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível verificar possíveis duplicidades.');
  const normalized = (data || []).map((lead) => {
    const relation = lead.crm_stages as unknown;
    const stage = Array.isArray(relation) ? relation[0] || null : relation;
    return { ...lead, crm_stages: stage } as PossibleDuplicateLead;
  });
  return normalized.filter((lead) => !lead.crm_stages?.is_final);
}

export async function createLead(payload: Record<string, unknown>) {
  const stage = await getStage('novo_lead');
  const ownerId = await getCurrentProfileId();
  const sanitizedPayload = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]),
  );
  if (sanitizedPayload.telefone) {
    sanitizedPayload.telefone = normalizePhoneForStorage(String(sanitizedPayload.telefone));
  }
  if (sanitizedPayload.meta_lead_id) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from('leads')
      .select('id')
      .eq('meta_lead_id', sanitizedPayload.meta_lead_id)
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw getFriendlyDatabaseError(duplicateError, 'Não foi possível validar o ID do formulário.');
    if (duplicate) throw new Error('Esse lead do formulário já foi cadastrado.');
  }

  const { data: inserted, error } = await supabase.from('leads').insert({
    ...sanitizedPayload, stage_id: stage.id, status: stage.name, owner_id: ownerId,
    etapa_cadencia: 'pre_degustacao', indice_followup: 0,
  }).select('id, created_at, proximo_followup_em').single();
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível cadastrar o lead. Tente novamente.');
  const { error: followupError } = await supabase
    .from('leads')
    .update({ proximo_followup_em: sameMomentAsCreatedAt(inserted.created_at) })
    .eq('id', inserted.id);
  if (followupError) throw getFriendlyDatabaseError(followupError, 'O lead foi criado, mas não foi possível preparar o primeiro follow-up.');
}

export async function updateLeadDetails(leadId: string, payload: Record<string, unknown>) {
  const phone = normalizePhoneForStorage(String(payload.telefone || ''));
  if (phone.length < 10 || phone.length > 11) throw new Error('Informe um telefone válido com DDD.');
  const email = String(payload.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');

  const allowedFields = [
    'nome_responsavel', 'telefone', 'email', 'empresa', 'segmento', 'produto_interesse', 'bairro',
    'endereco', 'origem', 'meta_lead_id', 'campanha', 'conjunto_anuncio', 'anuncio', 'link_origem',
    'indicado_por', 'responsavel_prospeccao', 'canal_prospeccao', 'data_envio_formulario',
    'interesse_degustacao', 'observacao', 'temperatura', 'vendedor_externo',
  ];
  const sanitized = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]),
  );
  sanitized.telefone = phone;
  const { error } = await supabase.from('leads').update(sanitized).eq('id', leadId);
  if (error) throw getFriendlyDatabaseError(error, 'Não foi possível salvar as alterações do lead.');
  await addInteraction(leadId, 'observacao', 'internal', 'Dados do lead editados');
}
