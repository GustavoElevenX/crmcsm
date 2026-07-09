export const LEAD_ORIGINS = [
  'Trafego Pago - Formulario Meta Ads',
  'Link da Bio',
  'Instagram Direct',
  'WhatsApp Organico',
  'Indicacao',
  'Prospecao Ativa',
  'Cliente Antigo',
  'Outro',
] as const;

export type LeadOrigin = (typeof LEAD_ORIGINS)[number];
export type Cadence = 'pre_degustacao' | 'pos_degustacao' | 'pos_proposta' | 'manual' | 'encerrado';
export type Temperature = 'frio' | 'morno' | 'quente';

export interface Stage {
  id: string;
  name: string;
  slug: string;
  position: number;
  is_final: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'vendedora' | 'vendedor_externo';
}

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  nome_responsavel: string;
  telefone: string;
  email?: string | null;
  empresa: string;
  segmento?: string | null;
  produto_interesse?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  origem: LeadOrigin;
  meta_lead_id?: string | null;
  campanha?: string | null;
  conjunto_anuncio?: string | null;
  anuncio?: string | null;
  link_origem?: string | null;
  indicado_por?: string | null;
  responsavel_prospeccao?: string | null;
  canal_prospeccao?: string | null;
  data_envio_formulario?: string | null;
  interesse_degustacao?: string | null;
  observacao?: string | null;
  stage_id: string;
  status: string;
  temperatura: Temperature;
  etapa_cadencia: Cadence;
  indice_followup: number;
  ultimo_contato_em?: string | null;
  proximo_followup_em?: string | null;
  ultimo_movimento_em?: string | null;
  degustacao_agendada_em?: string | null;
  degustacao_realizada_em?: string | null;
  vendedor_externo?: string | null;
  feedback_degustacao?: string | null;
  proposta_enviada_em?: string | null;
  valor_proposta?: number | null;
  quantidade_sugerida?: string | null;
  fechado_em?: string | null;
  valor_primeiro_pedido?: number | null;
  motivo_perda?: string | null;
  owner_id?: string | null;
  crm_stages?: Stage;
  profiles?: Profile | null;
  lead_interactions?: Interaction[];
}

export interface FollowupTemplate {
  id: string;
  name: string;
  cadencia: Exclude<Cadence, 'manual' | 'encerrado'>;
  followup_index: number;
  offset_days: number;
  template: string;
  active: boolean;
}

export interface Interaction {
  id: string;
  lead_id: string;
  created_at: string;
  type: 'whatsapp' | 'ligacao' | 'degustacao' | 'proposta' | 'observacao' | 'mudanca_status';
  direction: 'outbound' | 'inbound' | 'internal';
  message?: string | null;
  followup_index?: number | null;
  created_by?: string | null;
}

export type AlertStatus = 'atrasado' | 'novo_lead_parado' | 'proposta_sem_retorno' | 'lead_parado' | 'hoje' | 'em_dia';
export type View = 'dashboard' | 'kanban' | 'leads' | 'today' | 'late' | 'degustations' | 'proposals' | 'reports';
