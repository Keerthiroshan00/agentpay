import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bot, Check, ChevronDown, CircleHelp,
  Clock3, Command, CreditCard, ExternalLink, FileText, Fingerprint, Gauge,
  LayoutDashboard, LifeBuoy, LockKeyhole, Menu, MoreHorizontal, Plus, Search,
  Settings2, ShieldCheck, Sparkles, Wallet, X, Zap, CircleDollarSign, Send,
  CheckCircle2, AlertTriangle, Copy, LoaderCircle
} from 'lucide-react'

type TxStatus = 'Settled' | 'Pending' | 'Rejected'
type Transaction = {
  id: string
  service: string
  detail: string
  amount: string
  status: TxStatus
  time: string
  hash: string
}
const initialTransactions: Transaction[] = [
  { id: 'TX-2048', service: 'Web3 Research API', detail: 'Startup market research', amount: '0.0008 USDC', status: 'Settled', time: '2 min ago', hash: '0x71c4...a92f' },
  { id: 'TX-2047', service: 'Data Pulse', detail: 'Protocol analytics', amount: '0.0005 USDC', status: 'Settled', time: '18 min ago', hash: '0x38bd...f120' },
  { id: 'TX-2046', service: 'Web3 Research API', detail: 'Token ecosystem scan', amount: '0.0012 USDC', status: 'Rejected', time: '1 hr ago', hash: '—' },
  { id: 'TX-2045', service: 'Market Lens', detail: 'Market signal report', amount: '0.0006 USDC', status: 'Settled', time: '3 hrs ago', hash: '0x9f11...c40d' },
]
const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Transactions', icon: ArrowUpRight },
  { label: 'AI Tasks', icon: Bot },
  { label: 'Spending policy', icon: ShieldCheck },
]
function App() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [task, setTask] = useState('')
  const [budget, setBudget] = useState('0.001')
  const [running, setRunning] = useState(false)
  const [taskResult, setTaskResult] = useState<{ status: string; result: string } | null>(null)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [transactions, setTransactions] = useState(initialTransactions)
  const [showPolicy, setShowPolicy] = useState(false)
  const [dailyLimit, setDailyLimit] = useState('0.01')
  const [paymentCap, setPaymentCap] = useState('0.001')
  const [mobileNav, setMobileNav] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)
  const [groqConfigured, setGroqConfigured] = useState(false)

  useEffect(() => {
    const api = import.meta.env.VITE_API_URL || '/api'
    fetch(`${api}/health`).then(r => { if (!r.ok) throw new Error('API unavailable'); return r.json() })
      .then(data => {
        setApiConnected(true)
        setGroqConfigured(Boolean(data.groqConfigured))
        fetch(`${api}/policy`).then(r => r.ok ? r.json() : null).then(data => {
          if (data) { setPaymentCap(String(data.maxPaymentUsdc)); setDailyLimit(String(data.dailyBudgetUsdc)) }
        }).catch(() => undefined)
        fetch(`${api}/transactions`).then(r => r.ok ? r.json() : null).then(data => {
          if (data?.transactions?.length) setTransactions(data.transactions)
        }).catch(() => undefined)
      }).catch(() => setApiConnected(false))
  }, [])

  const filteredTransactions = useMemo(() => transactions.filter((tx) =>
    `${tx.id} ${tx.service} ${tx.detail} ${tx.status}`.toLowerCase().includes(search.toLowerCase())
  ), [transactions, search])

  const runTask = async () => {
    if (!task.trim()) { setNotice('Enter a task for your AI agent first.'); return }
    const numericBudget = Number(budget)
    if (!Number.isFinite(numericBudget) || numericBudget <= 0) { setNotice('Enter a valid positive task budget.'); return }
    setRunning(true)
    setTaskResult(null)
    setNotice('')
    try {
      const api = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${api}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, budgetUsdc: numericBudget })
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.task?.result) setTaskResult({ status: data.task.status, result: data.task.result })
        setNotice(data.reason || data.error || 'The backend rejected this task.')
        return
      }
      if (data.task?.result) setTaskResult({ status: data.task.status, result: data.task.result })
      setNotice(data.note || data.task?.result || 'Task submitted to AgentPay backend.')
      if (data.task?.status === 'Completed' && data.task?.result) setTask(`${task}`)
    } catch {
      setNotice('Cannot reach the backend. Start it with npm run dev and try again.')
    } finally { setRunning(false) }
  }
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText('0xA71e...9C42')
      setNotice('Demo wallet address copied.')
    } catch { setNotice('Wallet address: 0xA71e...9C42') }
  }
  const goNav = (label: string) => {
    setActiveNav(label)
    setMobileNav(false)
    if (label === 'Spending policy') setShowPolicy(true)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Zap size={20} fill="currentColor" /></div>
          <span>agent<span className="brand-light">pay</span></span>
          <button className="icon-button close-nav" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <div className="workspace">
          <div className="workspace-avatar"><Fingerprint size={19}/></div>
          <div className="workspace-copy"><strong>AgentPay Workspace</strong><span>Personal project</span></div>
          <ChevronDown size={15} className="muted-icon"/>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => goNav(label)}>
              <Icon size={18} strokeWidth={1.8}/><span>{label}</span>
              {label === 'Transactions' && <span className="nav-count">12</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label lower-label">PREFERENCES</div>
        <button className="nav-item" onClick={() => setShowPolicy(true)}><Settings2 size={18}/><span>Settings</span></button>
        <div className="sidebar-spacer"/>
        <div className="network-card">
          <div className="network-head"><span className="live-dot"/> TEST NETWORK <span className="network-pill">DEV</span></div>
          <div className="network-name"><span className="base-icon">◈</span><strong>Base Sepolia</strong></div>
          <p>Payments are processed on testnet.</p>
        </div>
        <button className="nav-item help-item" onClick={() => setNotice('AgentPay demo dashboard. Connect the backend for live task execution.')}><LifeBuoy size={18}/><span>Help & support</span></button>
        <div className="profile">
          <div className="profile-avatar">K</div>
          <div className="profile-copy"><strong>Project Admin</strong><span>Free workspace</span></div>
          <MoreHorizontal size={19} className="muted-icon"/>
        </div>
      </aside>

      {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button>
            <span>Workspace</span><span className="crumb-slash">/</span><strong>{activeNav}</strong>
          </div>
          <div className="top-actions">
            <button className="network-status wallet-status" onClick={copyAddress}><span className="live-dot"/> Wallet connected</button>
            <button className="icon-button" aria-label="Help" onClick={() => setNotice('AgentPay demo dashboard. Connect a backend for live data.')}><CircleHelp size={18}/></button>
            <div className="top-avatar">K</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line"/> AUTONOMOUS PAYMENTS PLATFORM</div>
              <h1>{activeNav === 'Overview' ? 'Good morning, Keerthi' : activeNav}<span className="wave">✳</span></h1>
              <p className="page-subtitle">Your AI agent, ready to get things done.</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" onClick={() => setShowPolicy(true)}><Settings2 size={16}/> Policy settings</button>
              <button className="primary-button" onClick={() => setActiveNav('AI Tasks')}><Plus size={17}/> New task</button>
            </div>
          </div>

          {activeNav === 'Overview' && <><section className="status-banner">
            <div className="banner-icon"><Bot size={22}/></div>
            <div className="banner-copy"><strong>Your agent is ready</strong><span>Spending policy active · All payments require backend authorization</span></div>
            <div className="banner-right"><span className="banner-dot"/> <span>System operational</span><ChevronDown size={15}/></div>
          </section>

          <section className="metrics-grid">
            <MetricCard label="Wallet balance" value="12.48" unit="USDC" change="Connected funds" icon={<Wallet size={18}/>} iconClass="violet" foot="Connected wallet" />
            <MetricCard label="Total spent today" value="0.0019" unit="USDC" change="19% of daily limit" icon={<ArrowUpRight size={18}/>} iconClass="orange" foot="Daily limit: 0.01 USDC" progress={19}/>
            <MetricCard label="Tasks completed" value="24" unit="tasks" change="+8 this week" icon={<CheckCircle2 size={18}/>} iconClass="green" foot="92% success rate" />
            <MetricCard label="Payments settled" value="18" unit="txns" change="On-chain verified" icon={<ShieldCheck size={18}/>} iconClass="blue" foot="Wallet activity" />
          </section>

          </>}

          {activeNav === 'AI Tasks' && <section className="content-grid task-view-grid">
            <div className="panel task-panel">
              <div className="panel-heading">
                <div><div className="section-kicker"><Sparkles size={14}/> AI WORKSPACE</div><h2>Run a new task</h2><p>Tell your agent what you need. It handles the rest.</p></div>
                <span className="ai-chip"><span className="live-dot"/> {groqConfigured ? 'Groq AI ready' : 'Groq API not configured'}</span>
              </div>
              <label className="field-label" htmlFor="task-input">What should your agent do?</label>
              <textarea id="task-input" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Research the latest developments in five Web3 startups and summarize the key findings..." rows={4}/>
              <div className="prompt-chips">
                <button onClick={() => setTask('Research the latest developments in five Web3 startups and summarize the key findings with source links.')}> <Search size={13}/> Web3 research</button>
                <button onClick={() => setTask('Analyze recent DeFi protocol metrics and summarize notable changes with sources.')}> <Activity size={13}/> DeFi analysis</button>
                <button onClick={() => setTask('Compare three blockchain data providers and recommend the most useful one.')}> <FileText size={13}/> Compare services</button>
              </div>
              <div className="task-controls">
                <div className="budget-control"><label className="field-label" htmlFor="task-budget">MAX TASK BUDGET</label><div className="budget-input"><CircleDollarSign size={16}/><input id="task-budget" value={budget} onChange={e => setBudget(e.target.value)} inputMode="decimal" aria-label="Maximum task budget"/><span>USDC</span><ChevronDown size={14}/></div></div>
                <button className="run-button" disabled={running} onClick={runTask}>{running ? <><LoaderCircle className="spin" size={17}/> Planning task...</> : <><Send size={16}/> Run agent <span>↗</span></>}</button>
              </div>
              {taskResult && <div className="result-preview"><CheckCircle2 size={17}/><div><strong>{taskResult.status === 'Completed' ? 'Task response' : 'Task failed'}</strong><span style={{ fontSize: 12, color: '#cdd3e5', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{taskResult.result}</span></div></div>}
              <div className="task-footnote"><LockKeyhole size={13}/> Your task is checked against spending policies before any payment.</div>
            </div>

            <div className="right-stack">
              <div className="panel agent-panel">
                <div className="panel-heading compact"><div><div className="section-kicker"><Activity size={14}/> AGENT STATUS</div><h2>Agent overview</h2></div><button className="icon-button" onClick={() => setNotice('Agent status is sample dashboard data.')} aria-label="Agent details"><MoreHorizontal size={19}/></button></div>
                <div className="agent-profile">
                  <div className="agent-orb"><Bot size={27}/><span className="orb-spark">✦</span></div>
                  <div className="agent-info"><strong>AgentPay Assistant</strong><span><span className="live-dot"/> Ready to execute</span></div>
                  <span className="version-pill">v1.0</span>
                </div>
                <div className="agent-stats"><div><span>Model</span><strong>Groq · LLM</strong></div><div><span>Permissions</span><strong><ShieldCheck size={13}/> Policy-bound</strong></div></div>
                <div className="agent-bottom"><span><span className="live-dot"/> Connected</span><button onClick={() => setNotice('Agent configuration will be available after backend integration.')}>Configure <ArrowUpRight size={13}/></button></div>
              </div>
              <div className="policy-card">
                <div className="policy-icon"><ShieldCheck size={20}/></div>
                <div className="policy-content"><strong>Spending policy active</strong><span>Max per payment <b>{paymentCap} USDC</b></span><span>Daily budget <b>{dailyLimit} USDC</b></span></div>
                <button className="icon-button" onClick={() => setShowPolicy(true)} aria-label="Edit policy"><Settings2 size={17}/></button>
              </div>
            </div>
          </section>}

          {activeNav === 'Transactions' && <section className="panel transactions-panel">
            <div className="transactions-heading">
              <div><div className="section-kicker"><Activity size={14}/> PAYMENT ACTIVITY</div><h2>Recent transactions</h2><p>Track every payment initiated by your agent.</p></div>
              <div className="transaction-actions"><div className="search-box"><Search size={15}/><input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><button className="secondary-button small" onClick={() => setActiveNav('Transactions')}>View all <ArrowUpRight size={14}/></button></div>
            </div>
            <div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>SERVICE</th><th>AMOUNT</th><th>STATUS</th><th>TIME</th><th></th></tr></thead><tbody>
              {filteredTransactions.map(tx => <tr key={tx.id}><td><div className="tx-id"><div className="tx-icon"><CreditCard size={15}/></div><div><strong>{tx.id}</strong><span>{tx.hash}</span></div></div></td><td><div className="service-cell"><strong>{tx.service}</strong><span>{tx.detail}</span></div></td><td><strong className="amount">{tx.amount}</strong></td><td><StatusPill status={tx.status}/></td><td className="time-cell">{tx.time}</td><td><button className="icon-button row-more" aria-label={`Details for ${tx.id}`} onClick={() => setNotice(`${tx.id}: ${tx.status}. ${tx.hash === '—' ? 'No transaction hash because payment was rejected.' : 'Demo transaction reference only; connect backend for verified explorer links.'}`)}><MoreHorizontal size={18}/></button></td></tr>)}
              {filteredTransactions.length === 0 && <tr><td colSpan={6} className="empty-state">No transactions match your search.</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing <b>{filteredTransactions.length}</b> of <b>{transactions.length}</b> transactions</span><button onClick={() => setNotice('Full transaction history requires backend integration.')}>Explore history <ArrowUpRight size={13}/></button></div>
          </section>}
          <footer className="footer"><span>© 2026 AgentPay <span className="footer-dot">·</span> Built for autonomous payments</span><span><span className="live-dot"/> Base Sepolia testnet <span className="footer-dot">·</span> <button onClick={() => setNotice('Prototype UI only. No live blockchain transaction is performed.')}>Demo environment</button></span></footer>
        </div>
      </main>

      {notice && <div className="toast" role="status"><div className="toast-mark"><Check size={15}/></div><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}

      {showPolicy && <div className="modal-backdrop" onClick={() => setShowPolicy(false)}><div className="policy-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="policy-title">
        <div className="modal-head"><div><div className="section-kicker"><ShieldCheck size={14}/> BACKEND-ENFORCED</div><h2 id="policy-title">Spending policy</h2><p>These values are a dashboard preview. Enforce them in your backend before enabling payments.</p></div><button className="icon-button" onClick={() => setShowPolicy(false)} aria-label="Close policy"><X size={19}/></button></div>
        <label className="modal-label" htmlFor="max-payment">Maximum per payment (USDC)</label><input id="max-payment" className="modal-input" value={paymentCap} onChange={e => setPaymentCap(e.target.value)} inputMode="decimal"/>
        <label className="modal-label" htmlFor="daily-limit">Daily spending budget (USDC)</label><input id="daily-limit" className="modal-input" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} inputMode="decimal"/>
        <div className="modal-note"><LockKeyhole size={15}/> UI settings alone do not authorize or block real payments.</div>
        <div className="modal-actions"><button className="secondary-button" onClick={() => setShowPolicy(false)}>Cancel</button><button className="primary-button" onClick={async () => {
          const max = Number(paymentCap), daily = Number(dailyLimit)
          if (!Number.isFinite(max) || !Number.isFinite(daily) || max <= 0 || daily <= 0 || max > daily) { setNotice('Enter valid positive limits. Per-payment cap must not exceed the daily budget.'); return }
          try {
            const api = import.meta.env.VITE_API_URL || '/api'
            const response = await fetch(`${api}/policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxPaymentUsdc: max, dailyBudgetUsdc: daily }) })
            const data = await response.json()
            if (!response.ok) { setNotice(data.error || 'Could not update backend policy.'); return }
            setShowPolicy(false); setNotice('Backend-enforced spending policy updated.')
          } catch { setNotice('Cannot reach backend. Policy was not changed.') }
        }}>Save policy</button></div>
      </div></div>}
    </div>
  )
}

function MetricCard({ label, value, unit, change, icon, iconClass, foot, progress }: {label:string;value:string;unit:string;change:string;icon:React.ReactNode;iconClass:string;foot:string;progress?:number}) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${iconClass}`}>{icon}</div></div><div className="metric-value">{value}<span>{unit}</span></div><div className="metric-change">{progress !== undefined ? <div className="mini-progress"><span style={{width:`${progress}%`}}/></div> : <span className="change-dot"><Check size={10}/></span>}<span>{change}</span></div><div className="metric-foot">{foot}</div></div>
}
function StatusPill({ status }: {status:TxStatus}) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span/>{status}</span>
}
export default App
