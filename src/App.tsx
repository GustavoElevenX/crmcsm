import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle, BarChart3, BellRing, CalendarCheck, ChevronRight, CircleDollarSign, ClipboardList,
  Columns3, Droplets, FileText, LayoutDashboard, LogOut, Menu, Plus, Search, Users, X,
} from 'lucide-react';
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { format, isAfter, isSameDay, isSameMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from './lib/supabase';
import {
  getAlertStatus, getFollowupLabel, getOperationalStageLabel, getOperationalStageSlug, getWhatsAppUrl,
  isFirstContactPending, markContactSent, markDegustationDone, markLeadResponded, moveLeadToStage,
} from './lib/crm';
import type { Lead, Profile, Stage, View } from './types';
import { Login } from './components/Login';
import { LeadForm } from './components/LeadForm';
import { LeadDrawer } from './components/LeadDrawer';
import { AlertBadge, DateText, FollowupDateForLead, OriginLabel, Temperature } from './components/common';
import logoUrl from '../imagens/logo cms.PNG';

const NAV: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'leads', label: 'Leads', icon: Users }, { id: 'today', label: 'Follow-ups de hoje', icon: CalendarCheck },
  { id: 'late', label: 'Atenção', icon: BellRing }, { id: 'degustations', label: 'Degustações', icon: Droplets },
  { id: 'proposals', label: 'Propostas', icon: FileText }, { id: 'reports', label: 'Relatórios simples', icon: BarChart3 },
];
const ATTENTION_STATUSES = ['atrasado', 'novo_lead_parado', 'proposta_sem_retorno', 'lead_parado'];
function needsAttention(lead: Lead) { return ATTENTION_STATUSES.includes(getAlertStatus(lead)); }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [view, setView] = useState<View>('dashboard');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true); setLoadError('');
    const [leadResult, stageResult, profileResult] = await Promise.all([
      supabase.from('leads').select('*, crm_stages(*), profiles(*), lead_interactions(*)').order('created_at', { ascending: false }),
      supabase.from('crm_stages').select('*').order('position'),
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
    ]);
    if (leadResult.error || stageResult.error) setLoadError(leadResult.error?.message || stageResult.error?.message || 'Falha ao carregar dados.');
    setLeads((leadResult.data || []).map((lead) => ({ ...lead, lead_interactions: [...(lead.lead_interactions || [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)) })) as Lead[]);
    setStages(stageResult.data || []);
    setProfile(profileResult.data);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (selected) setSelected(leads.find((lead) => lead.id === selected.id) || null); }, [leads]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authReady) return <div className="app-loader"><Droplets /><span>Preparando seu CRM...</span></div>;
  if (!session) return <Login />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="logo"><img src={logoUrl} alt="Casa de Sucos Mix" /><div><small>CRM B2B</small></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setMenuOpen(false); }}><Icon size={19} /><span>{label}</span>{id === 'late' && leads.filter(needsAttention).length > 0 && <b>{leads.filter(needsAttention).length}</b>}</button>)}</nav>
        <div className="sidebar-profile"><div className="avatar">{(profile?.full_name || session.user.email || 'V')[0].toUpperCase()}</div><div><strong>{profile?.full_name || 'Vendedora'}</strong><small>{session.user.email}</small></div><button title="Sair" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div><p className="eyebrow">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <button className="button primary" onClick={() => setFormOpen(true)}><Plus size={18} />Novo lead</button>
        </header>
        <div className="content">
          {loadError && <div className="notice error">Não foi possível carregar os dados. Atualize a página e tente novamente.</div>}
          {loading ? <div className="skeleton-page"><div /><div /><div /></div> :
            <Page view={view} leads={leads} stages={stages} currentUser={profile} onOpen={setSelected} onChanged={loadData} />}
        </div>
      </main>
      {formOpen && <LeadForm onClose={() => setFormOpen(false)} onSaved={loadData} onOpenExisting={(leadId) => setSelected(leads.find((lead) => lead.id === leadId) || null)} />}
      {selected && <LeadDrawer lead={selected} currentUser={profile} onClose={() => setSelected(null)} onChanged={loadData} />}
    </div>
  );
}

function Page(props: { view: View; leads: Lead[]; stages: Stage[]; currentUser?: Profile | null; onOpen: (lead: Lead) => void; onChanged: () => void }) {
  if (props.view === 'dashboard') return <Dashboard {...props} />;
  if (props.view === 'kanban') return <Kanban leads={props.leads} stages={props.stages} currentUser={props.currentUser} onOpen={props.onOpen} onChanged={props.onChanged} />;
  if (props.view === 'reports') return <Reports leads={props.leads} stages={props.stages} />;
  let title = '';
  let filtered = props.leads;
  if (props.view === 'today') { title = 'Follow-ups para fazer hoje'; filtered = filtered.filter((l) => getAlertStatus(l) === 'hoje'); }
  if (props.view === 'late') { title = 'Follow-ups que precisam de atenção'; filtered = filtered.filter(needsAttention); }
  if (props.view === 'degustations') { title = 'Degustações'; filtered = filtered.filter((l) => l.degustacao_agendada_em || l.degustacao_realizada_em); }
  if (props.view === 'proposals') { title = 'Propostas enviadas'; filtered = filtered.filter((l) => l.proposta_enviada_em); }
  return <LeadList {...props} leads={filtered} title={title} mode={props.view} />;
}

function Dashboard({ leads, onOpen }: { leads: Lead[]; onOpen: (lead: Lead) => void }) {
  const [period, setPeriod] = useState('all');
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState('');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [product, setProduct] = useState('');
  const [segment, setSegment] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const now = new Date();
  const filteredLeads = leads.filter((lead) => {
    const afterPeriod = period === 'all' || isAfter(new Date(lead.created_at), subDays(now, Number(period)));
    return afterPeriod && (!origin || lead.origem === origin) && (!status || getOperationalStageLabel(lead) === status)
      && (!stage || getOperationalStageSlug(lead) === stage) && (!owner || lead.owner_id === owner)
      && (!product || lead.produto_interesse === product) && (!segment || lead.segmento === segment)
      && (!neighborhood || lead.bairro === neighborhood);
  });
  const active = filteredLeads.filter((l) => !l.crm_stages?.is_final);
  const metrics = [
    ['Leads totais', filteredLeads.length, Users, 'neutral'], ['Novos hoje', filteredLeads.filter((l) => isSameDay(new Date(l.created_at), now)).length, Plus, 'blue'],
    ['Follow-ups hoje', filteredLeads.filter((l) => getAlertStatus(l) === 'hoje').length, CalendarCheck, 'green'],
    ['Atrasados', filteredLeads.filter((l) => getAlertStatus(l) === 'atrasado').length, BellRing, 'red'],
    ['Leads parados', active.filter((l) => ['lead_parado', 'novo_lead_parado'].includes(getAlertStatus(l))).length, AlertTriangle, 'amber'],
    ['Degustações', filteredLeads.filter((l) => l.degustacao_agendada_em).length, Droplets, 'purple'],
    ['Fechados no mês', filteredLeads.filter((l) => l.fechado_em && isSameMonth(new Date(l.fechado_em), now)).length, ClipboardList, 'green'],
    ['Valor no mês', filteredLeads.filter((l) => l.fechado_em && isSameMonth(new Date(l.fechado_em), now)).reduce((sum, l) => sum + Number(l.valor_primeiro_pedido || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), CircleDollarSign, 'lime'],
  ] as const;
  const urgent = active
    .filter((lead) => getAlertStatus(lead) !== 'em_dia')
    .sort((a, b) => alertRank(getAlertStatus(a)) - alertRank(getAlertStatus(b)))
    .slice(0, 6);
  const origins = [
    ['Tráfego pago', filteredLeads.filter((l) => l.origem.startsWith('Trafego')).length],
    ['Link da bio', filteredLeads.filter((l) => l.origem === 'Link da Bio').length],
    ['Indicação', filteredLeads.filter((l) => l.origem === 'Indicacao').length],
  ];
  return <>
    <div className="dashboard-filters">
      <select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="all">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select>
      <FilterSelect label="Origem" value={origin} setValue={setOrigin} values={leads.map((l) => [l.origem, l.origem])} />
      <FilterSelect label="Status" value={status} setValue={setStatus} values={leads.map((l) => [getOperationalStageLabel(l), getOperationalStageLabel(l)])} />
      <FilterSelect label="Etapa" value={stage} setValue={setStage} values={leads.map((l) => [getOperationalStageSlug(l), getOperationalStageLabel(l)])} />
      <FilterSelect label="Vendedora" value={owner} setValue={setOwner} values={leads.map((l) => [l.owner_id || '', l.profiles?.full_name || 'Sem responsável'])} />
      <FilterSelect label="Produto" value={product} setValue={setProduct} values={leads.map((l) => [l.produto_interesse || '', l.produto_interesse || ''])} />
      <FilterSelect label="Segmento" value={segment} setValue={setSegment} values={leads.map((l) => [l.segmento || '', l.segmento || ''])} />
      <FilterSelect label="Bairro" value={neighborhood} setValue={setNeighborhood} values={leads.map((l) => [l.bairro || '', l.bairro || ''])} />
    </div>
    <section className="welcome"><div><p className="eyebrow">Visão geral</p><h2>Bom trabalho, {leads[0]?.profiles?.full_name?.split(' ')[0] || 'time'}! <span>👋</span></h2><p>Estes são os números que merecem sua atenção agora.</p></div><div className="welcome-origins">{origins.map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div></section>
    <div className="metric-grid">{metrics.map(([label, value, Icon, tone]) => <article className={`metric-card ${tone}`} key={label}><div className="metric-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></article>)}</div>
    <section className="panel"><div className="panel-header"><div><p className="eyebrow">Prioridade do dia</p><h2>Leads que pedem atenção</h2></div><span className="muted">{urgent.length} de {active.length} ativos</span></div>
      <div className="urgent-list">{urgent.length ? urgent.map((lead) => <button key={lead.id} onClick={() => onOpen(lead)}><div className="lead-avatar">{lead.nome_responsavel[0]}</div><div className="lead-main"><strong>{lead.nome_responsavel}</strong><span>{lead.empresa} · {lead.produto_interesse || 'Produto não informado'}</span></div><AlertBadge lead={lead} /><div className="followup-date"><small>Próximo contato</small><FollowupDateForLead lead={lead} /></div><ChevronRight size={18} /></button>) : <div className="empty">Tudo em ordem por aqui. Nenhum lead urgente.</div>}</div>
    </section>
  </>;
}

function LeadList({ leads, onOpen, onChanged, title, mode }: { leads: Lead[]; onOpen: (lead: Lead) => void; onChanged: () => void; title?: string; mode?: View }) {
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('');
  const [stage, setStage] = useState('');
  const [feedback, setFeedback] = useState('');
  const shown = leads.filter((l) => `${l.nome_responsavel} ${l.empresa} ${l.telefone}`.toLowerCase().includes(query.toLowerCase()) && (!origin || l.origem === origin) && (!stage || getOperationalStageSlug(l) === stage));
  const isDegustationList = mode === 'degustations';

  async function quickAction(action: () => Promise<void>, success: string) {
    try {
      await action();
      setFeedback(success);
      onChanged();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    }
    setTimeout(() => setFeedback(''), 3500);
  }

  return <section className="panel table-panel"><div className="panel-header"><div><p className="eyebrow">{shown.length} registros</p><h2>{title || 'Todos os leads'}</h2></div></div>
    {feedback && <div className="table-feedback" role="status">{feedback}</div>}
    <div className="filters"><label className="search"><Search size={18} /><input placeholder="Buscar nome, empresa ou telefone..." value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <select value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">Todas as origens</option>{[...new Set(leads.map((l) => l.origem))].map((o) => <option key={o}>{o}</option>)}</select>
      <select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Todas as etapas</option>{[...new Map(leads.map((l) => [getOperationalStageSlug(l), getOperationalStageLabel(l)])).entries()].map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Origem</th><th>Segmento</th><th>Produto</th><th>Bairro</th><th>Etapa</th><th>Follow-up atual</th><th>Próximo follow-up</th><th>Alerta</th>{isDegustationList && <><th>Data da degustação</th><th>Vendedor externo</th></>}<th>Responsável</th><th>Ações</th></tr></thead>
      <tbody>{shown.map((lead) => {
        return <tr key={lead.id}><td><button className="name-button" onClick={() => onOpen(lead)}><strong>{lead.nome_responsavel}</strong><span>{lead.empresa}<br />{lead.telefone}</span></button></td><td><OriginLabel origin={lead.origem} /></td><td>{lead.segmento || '—'}</td><td>{lead.produto_interesse || '—'}</td><td>{lead.bairro || '—'}</td><td><span className="stage-pill">{getOperationalStageLabel(lead)}</span><small><Temperature value={lead.temperatura} /></small></td><td>{getFollowupLabel(lead)}</td><td><FollowupDateForLead lead={lead} /></td><td><AlertBadge lead={lead} /></td>{isDegustationList && <><td><DateText value={lead.degustacao_realizada_em || lead.degustacao_agendada_em} withTime /></td><td>{lead.vendedor_externo || '—'}<small>{lead.degustacao_realizada_em ? 'Realizada' : 'Agendada'}</small></td></>}<td>{lead.profiles?.full_name || '—'}</td><td><div className="row-actions"><button className="attend-action" onClick={() => onOpen(lead)}>Atender</button><a href={getWhatsAppUrl(lead)} target="_blank" rel="noreferrer">WhatsApp</a><button onClick={() => quickAction(() => markLeadResponded(lead.id), 'Lead marcado como respondido.')}>Respondeu</button></div></td></tr>;
      })}</tbody>
    </table>{!shown.length && <div className="empty">Nenhum lead encontrado com esses filtros.</div>}</div>
  </section>;
}

function Kanban({ leads, stages, currentUser, onOpen, onChanged }: { leads: Lead[]; stages: Stage[]; currentUser?: Profile | null; onOpen: (lead: Lead) => void; onChanged: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pendingFirstContact, setPendingFirstContact] = useState<Lead | null>(null);
  const [dropError, setDropError] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function dragEnd(event: DragEndEvent) {
    const stageSlug = event.over?.id as string | undefined;
    if (!stageSlug) return;
    const leadId = String(event.active.id);
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || getOperationalStageSlug(lead) === stageSlug) return;
    setDropError('');

    try {
      if (stageSlug === 'primeiro_contato_enviado' && isFirstContactPending(lead)) {
        setPendingFirstContact(lead);
        return;
      }
      if (stageSlug === 'sem_resposta' && isFirstContactPending(lead)) {
        setDropError('Envie o primeiro contato antes de mover o lead para Sem resposta.');
        return;
      }
      if (stageSlug === 'respondeu') {
        await markLeadResponded(leadId);
      } else if (stageSlug === 'degustacao_realizada') {
        await markDegustationDone(leadId);
      } else if (['degustacao_agendada', 'proposta_enviada', 'fechado', 'perdido'].includes(stageSlug)) {
        onOpen(lead);
        return;
      } else {
        await moveLeadToStage(leadId, stageSlug);
      }
      onChanged();
    } catch (error) {
      setDropError(error instanceof Error ? error.message : 'Não foi possível mover este lead.');
    }
  }

  async function confirmFirstContactSent() {
    if (!pendingFirstContact) return;
    setConfirming(true);
    setDropError('');
    try {
      await markContactSent(pendingFirstContact, currentUser?.full_name || undefined);
      setPendingFirstContact(null);
      onChanged();
    } catch (error) {
      setDropError(error instanceof Error ? error.message : 'Não foi possível registrar o primeiro contato.');
    } finally {
      setConfirming(false);
    }
  }

  return <>
    {dropError && <div className="table-feedback kanban-feedback" role="status">{dropError}</div>}
    <DndContext sensors={sensors} onDragEnd={dragEnd}><div className="kanban">{stages.map((stage) => <KanbanColumn key={stage.id} stage={stage} leads={leads.filter((l) => getOperationalStageSlug(l) === stage.slug)} onOpen={onOpen} />)}</div></DndContext>
    {pendingFirstContact && <div className="modal-backdrop kanban-confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !confirming && setPendingFirstContact(null)}>
      <div className="modal kanban-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="kanban-confirm-title">
        <h2 id="kanban-confirm-title">Confirmar primeiro contato</h2>
        <p>Você já enviou a primeira mensagem para <strong>{pendingFirstContact.nome_responsavel}</strong> pelo WhatsApp?</p>
        <small>Ao confirmar, o CRM registrará o envio e agendará o próximo follow-up para amanhã às 09h.</small>
        <div className="action-row">
          <button className="button secondary" disabled={confirming} onClick={() => setPendingFirstContact(null)}>Cancelar</button>
          <button className="button primary" disabled={confirming} onClick={confirmFirstContactSent}>{confirming ? 'Salvando...' : 'Sim, já enviei'}</button>
        </div>
      </div>
    </div>}
  </>;
}

function KanbanColumn({ stage, leads, onOpen }: { stage: Stage; leads: Lead[]; onOpen: (lead: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.slug });
  return <section ref={setNodeRef} className={`kanban-column ${isOver ? 'is-over' : ''}`}><header><i /><strong>{stage.name}</strong><span>{leads.length}</span></header><div className="kanban-cards">{leads.map((lead) => <KanbanCard key={lead.id} lead={lead} onOpen={onOpen} />)}{!leads.length && <div className="drop-empty">Arraste um lead para cá</div>}</div></section>;
}

function KanbanCard({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id });
  return <article ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} className="kanban-card" {...listeners} {...attributes} onDoubleClick={() => onOpen(lead)}>
    <div className="card-top"><OriginLabel origin={lead.origem} /><AlertBadge lead={lead} /></div><h3>{lead.nome_responsavel}</h3><p>{lead.empresa}</p><div className="card-product">{lead.produto_interesse || 'Produto não informado'}<small>{getFollowupLabel(lead)}</small></div><footer><span><FollowupDateForLead lead={lead} /></span><button onPointerDown={(e) => e.stopPropagation()} onClick={() => onOpen(lead)}>Abrir</button></footer>
  </article>;
}

function Reports({ leads, stages }: { leads: Lead[]; stages: Stage[] }) {
  const closed = leads.filter((l) => l.crm_stages?.slug === 'fechado');
  const value = closed.reduce((sum, l) => sum + Number(l.valor_primeiro_pedido || 0), 0);
  const origins = [...new Set(leads.map((l) => l.origem))].map((name) => [name, leads.filter((l) => l.origem === name).length] as const).sort((a, b) => b[1] - a[1]);
  return <><div className="report-summary"><article><span>Taxa de fechamento</span><strong>{leads.length ? ((closed.length / leads.length) * 100).toFixed(1) : '0'}%</strong></article><article><span>Degustações realizadas</span><strong>{leads.filter((l) => l.degustacao_realizada_em).length}</strong></article><article><span>Propostas enviadas</span><strong>{leads.filter((l) => l.proposta_enviada_em).length}</strong></article><article><span>Valor fechado</span><strong>{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></article></div>
    <div className="reports-grid"><ReportTable title="Leads por origem" rows={origins} total={leads.length} /><ReportTable title="Leads por etapa" rows={stages.map((s) => [s.name, leads.filter((l) => l.stage_id === s.id).length] as const)} total={leads.length} /><ReportTable title="Motivos de perda" rows={[...new Set(leads.filter((l) => l.motivo_perda).map((l) => l.motivo_perda!))].map((r) => [r, leads.filter((l) => l.motivo_perda === r).length] as const)} total={leads.filter((l) => l.motivo_perda).length} /></div></>;
}

function ReportTable({ title, rows, total }: { title: string; rows: readonly (readonly [string, number])[]; total: number }) {
  return <section className="panel report-panel"><div className="panel-header"><h2>{title}</h2></div>{rows.length ? rows.map(([name, count]) => <div className="report-row" key={name}><div><span>{name}</span><div><i style={{ width: `${total ? count / total * 100 : 0}%` }} /></div></div><strong>{count}</strong></div>) : <div className="empty">Ainda não há dados.</div>}</section>;
}

function FilterSelect({ label, value, setValue, values }: { label: string; value: string; setValue: (value: string) => void; values: (string[])[] }) {
  const unique = [...new Map(values.filter(([key, text]) => key && text).map(([key, text]) => [key, text])).entries()];
  return <select aria-label={label} value={value} onChange={(e) => setValue(e.target.value)}><option value="">{label}: todos</option>{unique.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>;
}

function alertRank(status: string) { return ['atrasado', 'novo_lead_parado', 'proposta_sem_retorno', 'lead_parado', 'hoje', 'em_dia'].indexOf(status); }
