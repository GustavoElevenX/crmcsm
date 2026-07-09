import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logoUrl from '../../imagens/logo cms.PNG';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível entrar agora. Tente novamente em instantes.',
      );
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-logo-card"><img src={logoUrl} alt="Casa de Sucos Mix" /></div>
        <p className="eyebrow">Casa de Sucos Mix</p>
        <h1>Relacionamentos que<br />viram bons negócios.</h1>
        <p>Seu funil comercial organizado, do primeiro oi ao primeiro pedido.</p>
        <div className="fruit fruit-one" /><div className="fruit fruit-two" />
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-logo"><img src={logoUrl} alt="Casa de Sucos Mix" /></div>
          <p className="eyebrow">Acesso interno</p>
          <h2>Bem-vinda de volta</h2>
          <p className="muted">Entre para acompanhar seus leads e follow-ups.</p>
          <label>E-mail<input type="email" placeholder="voce@casadesucosmix.com.br" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : 'Entrar no CRM'}
          </button>
          <p className="login-help">Não tem acesso? Fale com o administrador.</p>
        </form>
      </section>
    </main>
  );
}
