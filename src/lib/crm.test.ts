import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { formatPhoneForWhatsApp, getAlertStatus, getFollowupLabel, getStageSlugAfterContact, hasAutomaticFollowup } from './crm';
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
});
