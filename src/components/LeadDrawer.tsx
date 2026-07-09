import { useEffect, useState } from 'react';
import { Check, Clipboard, ExternalLink, MessageCircle, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FollowupTemplate, Lead, Profile } from '../types';
import {
  applyTemplate, copyCurrentMessage, getCurrentFollowupTemplate, getWhatsAppUrl,
  markContactSent, markDegustationDone, markLeadResponded, moveLeadToStage,
  pauseLead, startPostDegustation,
} from '../lib/crm';
import { AlertBadge, DateText, FollowupDateText, OriginLabel, Temperature } from './common';
import { CommercialActionModal, type CommercialAction } from './CommercialActionModal';
import { LeadForm } from './LeadForm';

export function LeadDrawer({ lead, currentUser, onClose, onChanged }: { lead: Lead; currentUser?: Profile | null; onClose: () => void; onChanged: () => void }) {
  const [template, setTemplate] = useState<FollowupTemplate | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [commercialAction, setCommercialAction] = useState<CommercialAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const userName = currentUser?.full_name || undefined;

  useEffect(() => {
    setMessageCopied(false);
    getCurrentFollowupTemplate(lead).then(setTemplate).catch(() => setTemplate(null));
  }, [lead.id, lead.etapa_cadencia, lead.indice_followup]);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); setToast('Alteração salva.'); onChanged(); return true; }
    catch (e) { setToast(e instanceof Error ? e.message : 'Algo deu errado.'); return false; }
    finally { setBusy(''); setTimeout(() => setToast(''), 2500); }
  }

  async function handleCopy() {
    setBusy('copy');
    try {
      await copyCurrentMessage(lead, userName);
      setMessageCopied(true);
      setToast('Mensagem copiada! Agora abra o WhatsApp, cole e envie.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Não foi possível copiar a mensagem.');
    } finally {
      setBusy('');
      setTimeout(() => setToast(''), 3500);
    }
  }

  async function handleSent() {
    const saved = await act('sent', () => markContactSent(lead, userName));
    if (saved) setMessageCopied(false);
  }

  const message = template ? applyTemplate(template.template, lead, userName) : '';

  return <>
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <header className="drawer-header">
          <div><p className="eyebrow">Detalhes do lead</p><h2>{lead.nome_responsavel}</h2><p>{lead.empresa}</p></div>
          <div className="drawer-header-actions"><button className="button secondary" onClick={() => setEditing(true)}><Pencil size={16} />Editar lead</button><button className="icon-button" onClick={onClose}><X /></button></div>
        </header>
        <div className="drawer-body">
          {toast && <div className="toast"><Check size={16} />{toast}</div>}
          <section className="detail-section">
            <div className="section-title"><h3>Dados principais</h3><OriginLabel origin={lead.origem} /></div>
            <div className="detail-grid">
              <Info label="Telefone" value={lead.telefone} /><Info label="E-mail" value={lead.email} />
              <Info label="Segmento" value={lead.segmento} /><Info label="Produto" value={lead.produto_interesse} />
              <Info label="Bairro" value={lead.bairro} /><Info label="Vendedor externo" value={lead.vendedor_externo} />
            </div>
          </section>
          <OriginDetails lead={lead} />
          <section className="detail-section">
            <div className="section-title"><h3>Status comercial</h3><AlertBadge lead={lead} /></div>
            <div className="status-strip">
              <div><small>Etapa atual</small><strong>{lead.crm_stages?.name || lead.status}</strong></div>
              <div><small>Temperatura</small><Temperature value={lead.temperatura} /></div>
              <div><small>Próximo follow-up</small><strong><FollowupDateText value={lead.proximo_followup_em} /></strong></div>
              <div><small>Responsável</small><strong>{lead.profiles?.full_name || 'Não definido'}</strong></div>
            </div>
          </section>
          <section className="detail-section message-section">
            <div className="section-title"><div><p className="eyebrow">Mensagem sugerida</p><h3>{template?.name || 'Cadência manual'}</h3></div></div>
            {message ? <div className="message-preview">{message}</div> : <div className="empty-inline">Não há mensagem automática para esta etapa.</div>}
            <p className="instruction"><MessageCircle size={16} />Copie a mensagem, cole no WhatsApp Web e depois clique em “Marcar contato como enviado”.</p>
            <div className="action-row">
              <button className="button primary" disabled={!message || !!busy} onClick={handleCopy}><Clipboard size={17} />{messageCopied ? 'Mensagem copiada' : 'Copiar mensagem'}</button>
              <a className="button whatsapp" href={getWhatsAppUrl(lead)} target="_blank" rel="noreferrer"><ExternalLink size={17} />Abrir WhatsApp Web</a>
              <button className="button secondary" title={messageCopied ? 'Confirme somente depois de enviar no WhatsApp' : 'Copie a mensagem antes de registrar o envio'} disabled={!template || !messageCopied || !!busy} onClick={handleSent}>Sim, já enviei</button>
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title"><h3>Ações comerciais</h3></div>
            <div className="commercial-actions">
              <Action label="Lead respondeu" busy={busy} onClick={() => act('respondeu', () => markLeadResponded(lead.id))} />
              <Action label="Agendar degustação" busy={busy} onClick={() => setCommercialAction('schedule')} />
              <Action label="Degustação realizada" busy={busy} onClick={() => act('degustacao', () => markDegustationDone(lead.id))} />
              {lead.crm_stages?.slug === 'degustacao_realizada' && lead.etapa_cadencia !== 'pos_degustacao' && <Action label="Iniciar pós-degustação" busy={busy} onClick={() => act('posdeg', () => startPostDegustation(lead.id))} />}
              <Action label="Proposta enviada" busy={busy} onClick={() => setCommercialAction('proposal')} />
              <Action label="Pedido teste / negociação" busy={busy} onClick={() => act('negociacao', () => moveLeadToStage(lead.id, 'pedido_teste_negociacao'))} />
              <Action label="Fechado" tone="success" busy={busy} onClick={() => setCommercialAction('close')} />
              <Action label="Perdido" tone="danger" busy={busy} onClick={() => setCommercialAction('lose')} />
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
    {commercialAction && <CommercialActionModal action={commercialAction} leadId={lead.id} onClose={() => setCommercialAction(null)} onSaved={onChanged} />}
    {editing && <LeadForm lead={lead} onClose={() => setEditing(false)} onSaved={onChanged} />}
  </>;
}

function OriginDetails({ lead }: { lead: Lead }) {
  const details: Array<[string, string | null | undefined, boolean?]> = [];
  if (lead.origem === 'Trafego Pago - Formulario Meta Ads') {
    details.push(
      ['Campanha', lead.campanha], ['Conjunto de anúncio', lead.conjunto_anuncio],
      ['Anúncio', lead.anuncio], ['ID do formulário / lead', lead.meta_lead_id],
      ['Envio do formulário', lead.data_envio_formulario, true],
    );
  }
  if (lead.origem === 'Link da Bio') details.push(['Link de origem', lead.link_origem]);
  if (lead.origem === 'Indicacao') details.push(['Indicado por', lead.indicado_por]);
  if (lead.origem === 'Prospecao Ativa') {
    details.push(['Responsável pela prospecção', lead.responsavel_prospeccao], ['Canal de prospecção', lead.canal_prospeccao]);
  }
  return <section className="detail-section"><div className="section-title"><h3>Origem do lead</h3><OriginLabel origin={lead.origem} /></div><div className="detail-grid">{details.length ? details.map(([label, value, date]) => <div className="info" key={label}><small>{label}</small><span>{date ? <DateText value={value} withTime /> : value || '—'}</span></div>) : <Info label="Detalhes adicionais" value="Não informados" />}</div></section>;
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
