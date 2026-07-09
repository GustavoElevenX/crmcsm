import { useState } from 'react';
import { X } from 'lucide-react';
import { createLead } from '../lib/crm';
import { LEAD_ORIGINS, type LeadOrigin } from '../types';

export function LeadForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [origin, setOrigin] = useState<LeadOrigin>('Trafego Pago - Formulario Meta Ads');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const rawValues = Object.fromEntries(new FormData(event.currentTarget));
    const values = Object.fromEntries(
      Object.entries(rawValues).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );
    const errors: Record<string, string> = {};
    const phoneDigits = String(values.telefone || '').replace(/\D/g, '');

    if (!values.nome_responsavel) errors.nome_responsavel = 'Informe o nome do responsável.';
    if (!values.empresa) errors.empresa = 'Informe a empresa ou estabelecimento.';
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      errors.telefone = 'Informe um telefone válido com DDD.';
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) {
      errors.email = 'Informe um e-mail válido.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Revise os campos destacados antes de continuar.');
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]),
      );
      await createLead({
        ...payload,
        telefone: phoneDigits,
        origem: origin,
        temperatura: values.temperatura || 'morno',
      });
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar o lead. Tente novamente.');
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal form-modal" onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">Novo contato</p><h2>Cadastrar lead</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
        <p className="muted">Preencha os dados essenciais. A origem é obrigatória para manter os relatórios confiáveis.</p>
        <div className="form-grid">
          <Field label="Nome do responsável *" error={fieldErrors.nome_responsavel}><input name="nome_responsavel" aria-invalid={!!fieldErrors.nome_responsavel} required /></Field>
          <Field label="Telefone *" error={fieldErrors.telefone}><input name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(98) 99999-9999" aria-invalid={!!fieldErrors.telefone} required /></Field>
          <Field label="E-mail" error={fieldErrors.email}><input name="email" type="email" autoComplete="email" aria-invalid={!!fieldErrors.email} /></Field>
          <Field label="Empresa / estabelecimento *" error={fieldErrors.empresa}><input name="empresa" aria-invalid={!!fieldErrors.empresa} required /></Field>
          <label>Segmento<input name="segmento" placeholder="Ex.: Padaria" /></label>
          <label>Produto de interesse<input name="produto_interesse" placeholder="Ex.: Sucos de 300ml" /></label>
          <label>Bairro / localização<input name="bairro" /></label>
          <label>Interesse em degustação<input name="interesse_degustacao" /></label>
          <label>Temperatura<select name="temperatura" defaultValue="morno"><option value="frio">Frio</option><option value="morno">Morno</option><option value="quente">Quente</option></select></label>
          <label>Origem *<select value={origin} onChange={(e) => setOrigin(e.target.value as LeadOrigin)} required>{LEAD_ORIGINS.map((item) => <option key={item}>{item}</option>)}</select></label>
          {origin === 'Trafego Pago - Formulario Meta Ads' && <><label>Campanha<input name="campanha" /></label><label>ID do formulário / lead<input name="meta_lead_id" /></label><label>Conjunto de anúncio<input name="conjunto_anuncio" /></label><label>Anúncio<input name="anuncio" /></label></>}
          {origin === 'Link da Bio' && <label>Link de origem<input name="link_origem" placeholder="Instagram Bio, Linktree..." /></label>}
          {origin === 'Indicacao' && <label>Indicado por<input name="indicado_por" /></label>}
          {origin === 'Prospecao Ativa' && <><label>Responsável pela prospecção<input name="responsavel_prospeccao" /></label><label>Canal de prospecção<input name="canal_prospeccao" /></label></>}
          <label className="span-2">Observação<textarea name="observacao" rows={3} /></label>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar lead'}</button></div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className={error ? 'field-invalid' : ''}>{label}{children}{error && <span className="field-error">{error}</span>}</label>;
}
