import { useEffect, useState } from 'react';
import { Check, Clipboard, ExternalLink, MessageCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FollowupTemplate, Lead, Profile } from '../types';
import {
  applyTemplate, closeLead, copyCurrentMessage, getCurrentFollowupTemplate, getWhatsAppUrl, loseLead,
  markContactSent, markDegustationDone, markLeadResponded, markProposalSent, moveLeadToStage,
  pauseLead, scheduleDegustation, startPostDegustation,
} from '../lib/crm';
import { AlertBadge, DateText, OriginLabel, Temperature } from './common';

export function LeadDrawer({ lead, currentUser, onClose, onChanged }: { lead: Lead; currentUser?: Profile | null; onClose: () => void; onChanged: () => void }) {
  const [template, setTemplate] = useState<FollowupTemplate | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const userName = currentUser?.full_name || undefined;

  useEffect(() => { getCurrentFollowupTemplate(lead).then(setTemplate).catch(() => setTemplate(null)); }, [lead]);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); setToast('Alteração salva.'); onChanged(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Algo deu errado.'); }
    finally { setBusy(''); setTimeout(() => setToast(''), 2500); }
  }

  const message = template ? applyTemplate(template.template, lead, userName) : '';

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <header className="drawer-header">
          <div><p className="eyebrow">Detalhes do lead</p><h2>{lead.nome_responsavel}</h2><p>{lead.empresa}</p></div>
          <button className="icon-button" onClick={onClose}><X /></button>
        </header>
        <div className="drawer-body">
          {toast && <div className="toast"><Check size={16} />{toast}</div>}
          <section className="detail-section">
            <div className="section-title"><h3>Dados principais</h3><OriginLabel origin={lead.origem} /></div>
            <div className="detail-grid">
              <Info label="Telefone" value={lead.telefone} /><Info label="E-mail" value={lead.email} />
              <Info label="Segmento" value={lead.segmento} /><Info label="Produto" value={lead.produto_interesse} />
              <Info label="Bairro" value={lead.bairro} /><Info label="Campanha / indicação" value={lead.campanha || lead.indicado_por} />
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title"><h3>Status comercial</h3><AlertBadge lead={lead} /></div>
            <div className="status-strip">
              <div><small>Etapa atual</small><strong>{lead.crm_stages?.name || lead.status}</strong></div>
              <div><small>Temperatura</small><Temperature value={lead.temperatura} /></div>
              <div><small>Próximo follow-up</small><strong><DateText value={lead.proximo_followup_em} withTime /></strong></div>
              <div><small>Responsável</small><strong>{lead.profiles?.full_name || 'Não definido'}</strong></div>
            </div>
          </section>
          <section className="detail-section message-section">
            <div className="section-title"><div><p className="eyebrow">Mensagem sugerida</p><h3>{template?.name || 'Cadência manual'}</h3></div></div>
            {message ? <div className="message-preview">{message}</div> : <div className="empty-inline">Não há mensagem automática para esta etapa.</div>}
            <p className="instruction"><MessageCircle size={16} />Copie a mensagem, cole no WhatsApp Web e depois clique em “Marcar contato como enviado”.</p>
            <div className="action-row">
              <button className="button primary" disabled={!message || !!busy} onClick={() => act('copy', async () => { await copyCurrentMessage(lead, userName); setToast('Mensagem copiada!'); })}><Clipboard size={17} />Copiar mensagem</button>
              <a className="button whatsapp" href={getWhatsAppUrl(lead)} target="_blank" rel="noreferrer"><ExternalLink size={17} />Abrir WhatsApp Web</a>
              <button className="button secondary" disabled={!template || !!busy} onClick={() => act('sent', () => markContactSent(lead, userName))}>Marcar contato enviado</button>
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title"><h3>Ações comerciais</h3></div>
            <div className="commercial-actions">
              <Action label="Lead respondeu" busy={busy} onClick={() => act('respondeu', () => markLeadResponded(lead.id))} />
              <Action label="Agendar degustação" busy={busy} onClick={() => {
                const value = prompt('Data e hora da degustação (AAAA-MM-DD HH:mm):');
                if (value) act('agenda', () => scheduleDegustation(lead.id, new Date(value.replace(' ', 'T'))));
              }} />
              <Action label="Degustação realizada" busy={busy} onClick={() => act('degustacao', () => markDegustationDone(lead.id))} />
              <Action label="Iniciar pós-degustação" busy={busy} onClick={() => act('posdeg', () => startPostDegustation(lead.id))} />
              <Action label="Proposta enviada" busy={busy} onClick={() => {
                const value = prompt('Valor da proposta (opcional):');
                act('proposta', () => markProposalSent(lead.id, value ? Number(value.replace(',', '.')) : undefined));
              }} />
              <Action label="Pedido teste / negociação" busy={busy} onClick={() => act('negociacao', () => moveLeadToStage(lead.id, 'pedido_teste_negociacao'))} />
              <Action label="Fechado" tone="success" busy={busy} onClick={() => {
                const value = prompt('Valor do primeiro pedido (opcional):');
                act('fechado', () => closeLead(lead.id, value ? Number(value.replace(',', '.')) : undefined));
              }} />
              <Action label="Perdido" tone="danger" busy={busy} onClick={() => {
                const reason = prompt('Qual foi o motivo da perda?');
                if (reason) act('perdido', () => loseLead(lead.id, reason));
              }} />
              <Action label="Pausado" busy={busy} onClick={() => act('pausado', () => pauseLead(lead.id))} />
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title"><h3>Histórico</h3><span className="count">{lead.lead_interactions?.length || 0}</span></div>
            <div className="timeline">
              {lead.lead_interactions?.length ? lead.lead_interactions.map((item) => (
                <div className="timeline-item" key={item.id}><i /><div><strong>{interactionTitle(item.type)}</strong><time>{format(new Date(item.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}</time><p>{item.message || 'Registro sem observação.'}</p></div></div>
              )) : <div className="empty-inline">Nenhuma interação registrada ainda.</div>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="info"><small>{label}</small><span>{value || '—'}</span></div>;
}

function Action({ label, onClick, busy, tone = '' }: { label: string; onClick: () => void; busy: string; tone?: string }) {
  return <button className={`button commercial ${tone}`} disabled={!!busy} onClick={onClick}>{label}</button>;
}

function interactionTitle(type: string) {
  return ({ whatsapp: 'Mensagem enviada', ligacao: 'Ligação', degustacao: 'Degustação', proposta: 'Proposta', observacao: 'Observação', mudanca_status: 'Mudança de etapa' } as Record<string, string>)[type] || type;
}
