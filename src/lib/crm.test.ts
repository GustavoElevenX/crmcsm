import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: fromMock } }));

import {
  BUSINESS_FOLLOWUP_HOUR, findActiveLeadsByPhone, formatPhoneForWhatsApp, getAlertStatus,
  getFinalCadenceChanges, getFollowupLabel, getPostDegustationChanges, getPostProposalChanges,
  getStageSlugAfterContact, hasAutomaticFollowup, nextCommercialFollowupDate, normalizePhone,
  normalizePhoneForStorage,
} from './crm';
import type { Lead } from '../types';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date();
  return {
    id: 'lead-1',
    created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    updated_at: now.toISOString(),
    nome_responsavel: 'Teste',
    telefone: '98999999999',
    empresa: 'Empresa Teste',
    origem: 'Indicacao',
    stage_id: 'stage-1',
    status: 'Novo lead',
    temperatura: 'morno',
    etapa_cadencia: 'pre_degustacao',
    indice_followup: 0,
    proximo_followup_em: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    ultimo_movimento_em: now.toISOString(),
    crm_stages: { id: 'stage-1', name: 'Novo lead', slug: 'novo_lead', position: 1, is_final: false },
    ...overrides,
  };
}

describe('alertas comerciais', () => {
  it('mantém lead recém-criado como Hoje mesmo com alguns minutos de diferença', () => {
    expect(getAlertStatus(makeLead())).toBe('hoje');
  });

  it('marca novo lead parado somente após duas horas sem contato', () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000).toISOString();
    expect(getAlertStatus(makeLead({ created_at: createdAt }))).toBe('novo_lead_parado');
  });

  it('considera Hoje um follow-up anterior no mesmo dia', () => {
    const now = new Date();
    const earlierToday = new Date(now);
    earlierToday.setHours(0, 1, 0, 0);
    expect(getAlertStatus(makeLead({
      crm_stages: { id: 'stage-2', name: '1º contato enviado', slug: 'primeiro_contato_enviado', position: 2, is_final: false },
      status: '1º contato enviado',
      indice_followup: 1,
      ultimo_contato_em: now.toISOString(),
      proximo_followup_em: earlierToday.toISOString(),
    }))).toBe('hoje');
  });

  it('marca como Atrasado apenas uma data anterior ao dia atual', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getAlertStatus(makeLead({
      crm_stages: { id: 'stage-2', name: '1º contato enviado', slug: 'primeiro_contato_enviado', position: 2, is_final: false },
      status: '1º contato enviado',
      indice_followup: 1,
      ultimo_contato_em: new Date().toISOString(),
      proximo_followup_em: yesterday.toISOString(),
    }))).toBe('atrasado');
  });

  it('mantém em dia um lead com follow-up futuro mesmo sem movimento há mais de três dias', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const oldMovement = new Date();
    oldMovement.setDate(oldMovement.getDate() - 4);
    expect(getAlertStatus(makeLead({
      crm_stages: { id: 'manual', name: 'Degustação agendada', slug: 'degustacao_agendada', position: 5, is_final: false },
      etapa_cadencia: 'manual',
      proximo_followup_em: future.toISOString(),
      ultimo_movimento_em: oldMovement.toISOString(),
    }))).toBe('em_dia');
  });

  it('não gera pendência em etapa final', () => {
    expect(getAlertStatus(makeLead({
      etapa_cadencia: 'encerrado',
      crm_stages: { id: 'final', name: 'Fechado', slug: 'fechado', position: 9, is_final: true },
    }))).toBe('em_dia');
  });
});

describe('helpers operacionais', () => {
  it('formata telefone brasileiro para WhatsApp', () => {
    expect(formatPhoneForWhatsApp('(98) 99999-9999')).toBe('5598999999999');
  });

  it('salva telefones com e sem +55 no mesmo formato nacional', () => {
    expect(normalizePhoneForStorage('+55 98 99999-9999')).toBe('98999999999');
    expect(normalizePhoneForStorage('98 99999-9999')).toBe('98999999999');
  });

  it('exibe o follow-up atual de forma clara', () => {
    expect(getFollowupLabel(makeLead({ indice_followup: 1 }))).toBe('Pré-degustação 2');
    expect(getFollowupLabel(makeLead({ etapa_cadencia: 'manual' }))).toBe('Manual');
  });

  it('move o primeiro contato e os retornos sem resposta para as etapas corretas', () => {
    expect(getStageSlugAfterContact('pre_degustacao', 0)).toBe('primeiro_contato_enviado');
    expect(getStageSlugAfterContact('pre_degustacao', 1)).toBe('sem_resposta');
    expect(getStageSlugAfterContact('pos_proposta', 0)).toBeNull();
  });

  it('desabilita ações automáticas em cadências manuais ou encerradas', () => {
    expect(hasAutomaticFollowup(makeLead())).toBe(true);
    expect(hasAutomaticFollowup(makeLead({ etapa_cadencia: 'manual' }))).toBe(false);
    expect(hasAutomaticFollowup(makeLead({ etapa_cadencia: 'encerrado' }))).toBe(false);
  });

  it('padroniza o próximo contato para 09:00 do dia comercial calculado', () => {
    const base = new Date(2026, 6, 8, 21, 36);
    const next = new Date(nextCommercialFollowupDate(base, 1));
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(BUSINESS_FOLLOWUP_HOUR);
    expect(next.getMinutes()).toBe(0);
  });

  it('encerra a cadência e remove o próximo follow-up em etapa final', () => {
    expect(getFinalCadenceChanges()).toEqual({ etapa_cadencia: 'encerrado', proximo_followup_em: null });
  });

  it('inicia automaticamente as cadências pós-degustação e pós-proposta', () => {
    const now = new Date(2026, 6, 8, 18, 30);
    expect(getPostDegustationChanges(now)).toMatchObject({ etapa_cadencia: 'pos_degustacao', indice_followup: 0 });
    const proposal = getPostProposalChanges(now);
    expect(proposal.etapa_cadencia).toBe('pos_proposta');
    expect(new Date(proposal.proximo_followup_em).getHours()).toBe(9);
  });

  it('normaliza telefone e encontra possíveis duplicidades ativas sem bloquear', async () => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [
        { id: '1', nome_responsavel: 'Ativo', empresa: 'Empresa', status: 'Novo lead', crm_stages: { name: 'Novo lead', slug: 'novo_lead', is_final: false } },
        { id: '2', nome_responsavel: 'Final', empresa: 'Empresa', status: 'Fechado', crm_stages: { name: 'Fechado', slug: 'fechado', is_final: true } },
      ],
      error: null,
    });
    fromMock.mockReturnValue({ select: vi.fn().mockReturnValue(query) });
    const result = await findActiveLeadsByPhone('+55 (98) 99999-9999');
    expect(normalizePhone('(98) 99999-9999')).toBe('98999999999');
    expect(query.eq).toHaveBeenCalledWith('telefone', '98999999999');
    expect(result).toHaveLength(1);
    expect(result[0].nome_responsavel).toBe('Ativo');
  });

  it('mantém proteção única contra meta_lead_id no banco', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/202607090003_unique_meta_leads.sql', import.meta.url), 'utf8');
    expect(migration).toContain('create unique index if not exists idx_leads_meta_lead_id_unique');
  });

  it('mantém dados legados editáveis e valida telefone somente quando alterado', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/202607090005_normalize_phone_storage.sql', import.meta.url), 'utf8');
    expect(migration).toContain('before insert or update of telefone');
    expect(migration).toContain('normalize_and_validate_lead_phone');
    expect(migration).not.toContain('add constraint telefone_tamanho_brasil');
  });
});
