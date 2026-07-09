import { format, isBefore, isSameDay, isTomorrow, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AlertStatus, Lead } from '../types';
import { getAlertStatus, isFirstContactPending } from '../lib/crm';

export const ALERT_LABELS: Record<AlertStatus, string> = {
  atrasado: 'Atrasado', novo_lead_parado: 'Novo lead parado', proposta_sem_retorno: 'Proposta sem retorno',
  lead_parado: 'Lead parado', hoje: 'Hoje', em_dia: 'Em dia',
};

export function AlertBadge({ lead }: { lead: Lead }) {
  const status = getAlertStatus(lead);
  return <span className={`badge alert-${status}`}>{ALERT_LABELS[status]}</span>;
}

export function Temperature({ value }: { value: Lead['temperatura'] }) {
  return <span className={`temperature ${value}`}><i />{value[0].toUpperCase() + value.slice(1)}</span>;
}

export function DateText({ value, withTime = false }: { value?: string | null; withTime?: boolean }) {
  if (!value) return <span className="muted">—</span>;
  return <>{format(new Date(value), withTime ? "dd/MM/yyyy 'às' HH:mm" : 'dd/MM/yyyy', { locale: ptBR })}</>;
}

export function FollowupDateText({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const date = new Date(value);
  const now = new Date();
  if (isSameDay(date, now)) return <>Hoje</>;
  if (isTomorrow(date)) return <>Amanhã</>;
  if (isBefore(startOfDay(date), startOfDay(now))) {
    return <>Atrasado desde {format(date, 'dd/MM/yyyy', { locale: ptBR })}</>;
  }
  return <>{format(date, 'dd/MM/yyyy', { locale: ptBR })}</>;
}

export function FollowupDateForLead({ lead }: { lead: Lead }) {
  if (!isFirstContactPending(lead)) {
    return <FollowupDateText value={lead.proximo_followup_em} />;
  }
  if (!lead.proximo_followup_em) return <span className="muted">—</span>;

  const date = new Date(lead.proximo_followup_em);
  const now = new Date();
  if (isSameDay(date, now)) return <>Hoje — 1º contato</>;
  if (isTomorrow(date)) return <>Amanhã — 1º contato</>;
  if (isBefore(startOfDay(date), startOfDay(now))) {
    return <>1º contato pendente desde {format(date, 'dd/MM/yyyy', { locale: ptBR })}</>;
  }
  return <>{format(date, 'dd/MM/yyyy', { locale: ptBR })} — 1º contato</>;
}

export function OriginLabel({ origin }: { origin: Lead['origem'] }) {
  const labels: Record<string, string> = {
    'Trafego Pago - Formulario Meta Ads': 'Tráfego pago', 'Link da Bio': 'Link da bio',
    'Instagram Direct': 'Instagram', 'WhatsApp Organico': 'WhatsApp', Indicacao: 'Indicação',
    'Prospecao Ativa': 'Prospecção', 'Cliente Antigo': 'Cliente antigo', Outro: 'Outro',
  };
  return <span className="origin-label">{labels[origin] || origin}</span>;
}
