import { useState } from 'react';
import { X } from 'lucide-react';
import { closeLead, loseLead, markProposalSent, scheduleDegustation } from '../lib/crm';

export type CommercialAction = 'schedule' | 'proposal' | 'close' | 'lose';

const TITLES: Record<CommercialAction, string> = {
  schedule: 'Agendar degustação',
  proposal: 'Registrar proposta',
  close: 'Fechar primeiro pedido',
  lose: 'Registrar perda',
};

export function CommercialActionModal({
  action, leadId, onClose, onSaved,
}: {
  action: CommercialAction;
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setSaving(true);
      if (action === 'schedule') {
        const date = new Date(String(values.date || ''));
        if (Number.isNaN(date.getTime())) throw new Error('Informe a data e hora da degustação.');
        if (!String(values.external_seller || '').trim()) throw new Error('Informe o vendedor externo responsável.');
        await scheduleDegustation(leadId, date, String(values.external_seller), String(values.note || ''));
      }
      if (action === 'proposal') {
        const amount = optionalPositiveNumber(values.amount);
        const quantity = String(values.quantity || '').trim();
        const note = String(values.note || '').trim();
        if (amount === undefined && !quantity && !note) {
          throw new Error('Informe pelo menos valor, quantidade sugerida ou uma observação sobre a proposta.');
        }
        await markProposalSent(leadId, amount, quantity, note);
      }
      if (action === 'close') {
        const amount = optionalPositiveNumber(values.amount);
        const note = String(values.note || '').trim();
        if (amount === undefined && !note) {
          throw new Error('Informe o valor do primeiro pedido ou uma observação.');
        }
        await closeLead(leadId, amount, note);
      }
      if (action === 'lose') {
        const reason = String(values.reason || '').trim();
        if (!reason) throw new Error('Informe o motivo da perda.');
        await loseLead(leadId, reason);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir esta ação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop action-modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal action-modal" onSubmit={submit}>
        <div className="modal-header">
          <div><p className="eyebrow">Ação comercial</p><h2>{TITLES[action]}</h2></div>
          <button type="button" className="icon-button" onClick={onClose}><X /></button>
        </div>
        <div className="action-form">
          {action === 'schedule' && <>
            <label>Data e hora *<input name="date" type="datetime-local" required /></label>
            <label>Vendedor externo *<input name="external_seller" placeholder="Nome do responsável" required /></label>
            <label>Observação<textarea name="note" rows={3} placeholder="Endereço, referência ou orientação para a visita" /></label>
          </>}
          {action === 'proposal' && <>
            <label>Valor da proposta<input name="amount" type="number" min="0" step="0.01" placeholder="0,00" /></label>
            <label>Quantidade sugerida<input name="quantity" placeholder="Ex.: 3 caixas, 24 unidades" /></label>
            <label>Observação<textarea name="note" rows={3} /></label>
          </>}
          {action === 'close' && <>
            <label>Valor do primeiro pedido<input name="amount" type="number" min="0" step="0.01" placeholder="0,00" /></label>
            <label>Observação<textarea name="note" rows={3} /></label>
          </>}
          {action === 'lose' && <label>Motivo da perda *<textarea name="reason" rows={4} required placeholder="Ex.: preço, prazo, sem interesse..." /></label>}
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </form>
    </div>
  );
}

function optionalPositiveNumber(value: FormDataEntryValue | undefined) {
  if (value === undefined || String(value).trim() === '') return undefined;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Informe um valor válido.');
  return parsed;
}
