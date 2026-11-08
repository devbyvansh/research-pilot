import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, FlaskConical, Home, Menu, MessageCircle, Plus, Search, Settings, Upload, X } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase.js'
import './styles.css'
import './auth.css'
import './welcome.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const NAV = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'papers', label: 'My papers', icon: BookOpen },
  { id: 'upload', label: 'New analysis', icon: Plus },
  { id: 'reports', label: 'Reports', icon: FileText },
]
function App() {
  const [screen, setScreen] = useState('overview')
  const [activePaper, setActivePaper] = useState(null)
  const [papers, setPapers] = useState([])
  const [reports, setReports] = useState([])
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authPage, setAuthPage] = useState('welcome')
  const [authMode, setAuthMode] = useState('signin')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lang, setLang] = useState('English')
  const [toast, setToast] = useState('')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installVisible, setInstallVisible] = useState(false)
  const [notif, setNotif] = useState(false)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedSections, setSelectedSections] = useState(['Executive summary', 'Research objectives', 'Methodology', 'Key findings'])
  const fileRef = useRef(null)
  const chatRef = useRef(null)

  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
    if ('serviceWorker' in navigator && import.meta.env.DEV) navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()))
    const handler = e => { e.preventDefault(); setInstallPrompt(e); setInstallVisible(true) }
    window.addEventListener('beforeinstallprompt', handler)
    if (!localStorage.getItem('rp-install-dismissed') && /Android|iPhone|iPad/i.test(navigator.userAgent)) setTimeout(() => setInstallVisible(true), 1800)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) }).catch(() => setAuthReady(true))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true) })
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session?.access_token) { setPapers([]); setReports([]); setActivePaper(null); return }
    const headers = { Authorization: `Bearer ${session.access_token}` }
    fetch(`${API}/api/papers`, { headers }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not load your papers.')
      setPapers(data)
    }).catch(error => setToast(error.message))
    fetch(`${API}/api/reports`, { headers }).then(response => response.ok ? response.json() : []).then(setReports).catch(() => {})
  }, [session?.access_token])
  useEffect(() => {
    if (screen !== 'chat' || !activePaper || !session?.access_token) return
    fetch(`${API}/api/papers/${activePaper.id}/messages`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(response => response.ok ? response.json() : [])
      .then(data => setMessages(data))
      .catch(() => {})
  }, [screen, activePaper?.id, session?.access_token])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages, asking])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t) } }, [toast])

  const go = id => { setScreen(id); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openPaper = async paper => {
    setActivePaper(paper); setMessages([]); go('summary')
    if (!session?.access_token) return
    try {
      const response = await fetch(`${API}/api/papers/${paper.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (response.ok) { const detail = await response.json(); setActivePaper(current => current?.id === paper.id ? { ...current, ...detail } : current) }
    } catch {}
  }
  const dismissInstall = () => { setInstallVisible(false); localStorage.setItem('rp-install-dismissed', '1') }

  async function submitAuth(event) {
    event.preventDefault(); setAuthError(''); setAuthBusy(true)
    try {
      if (!supabase) throw new Error('Add your Supabase project URL and publishable key to frontend/.env, then restart Vite.')
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { full_name: authName } } })
        if (error) throw error
        if (!data.session) setAuthError('Check your email for a confirmation link, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        if (error) throw error
      }
    } catch (error) { setAuthError(error.message || 'Authentication failed.') }
    finally { setAuthBusy(false) }
  }
  async function signOut() { await supabase?.auth.signOut(); setPapers([]); setReports([]); setActivePaper(null); setMessages([]); setScreen('overview'); setAuthPage('welcome') }

  async function upload(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { setToast('Choose a PDF file to continue.'); return }
    setSelectedFile(file); setUploading(true)
    const form = new FormData(); form.append('file', file)
    try {
      const response = await fetch(`${API}/api/papers`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Upload failed.')
      const paper = { ...data, status: 'Analysed' }
      setPapers(prev => [paper, ...prev.filter(p => p.id !== paper.id)]); setActivePaper(paper); setToast('Paper saved to your account.'); go('summary')
    } catch (error) {
      setToast(error.message.includes('Failed to fetch') ? 'Could not reach the API. Start FastAPI on port 8000.' : error.message)
    } finally { setUploading(false) }
  }

  async function sendQuestion(e) {
    e?.preventDefault(); const question = query.trim(); if (!question || asking) return
    setMessages(prev => [...prev, { role: 'user', text: question }]); setQuery(''); setAsking(true)
    try {
      const response = await fetch(`${API}/api/papers/${activePaper.id}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ question, language: lang }) })
      if (!response.ok) { const data = await response.json(); throw new Error(data.detail || 'Could not answer this question.') }
      const data = await response.json(); setMessages(prev => [...prev, { role: 'assistant', text: data.answer, sources: data.sources }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: error.message }])
    } finally { setAsking(false) }
  }

  async function installApp() {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); setInstallVisible(false) }
    else if (window.matchMedia('(display-mode: standalone)').matches) setToast('ResearchPilot is already installed.')
    else if (/iPhone|iPad/i.test(navigator.userAgent)) setToast('In Safari, tap Share, then Add to Home Screen.')
    else setToast('Choose “Install ResearchPilot” from your browser menu or address bar.')
  }
  async function enableNotifications() {
    if (!('Notification' in window)) { setToast('Notifications are not supported in this browser.'); return }
    const permission = await Notification.requestPermission(); setNotif(permission === 'granted'); setToast(permission === 'granted' ? 'Notifications enabled.' : 'Notification permission was not granted.')
  }
  async function downloadReport() {
    try {
      const response = await fetch(`${API}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ paper_id: activePaper.id, sections: selectedSections, language: lang }) })
      if (!response.ok) throw new Error('api')
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${activePaper.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.pdf`; a.click(); URL.revokeObjectURL(url); setToast('PDF saved to your account and downloaded.')
      fetch(`${API}/api/reports`, { headers: { Authorization: `Bearer ${session.access_token}` } }).then(r => r.ok ? r.json() : []).then(setReports)
    } catch { setToast('Could not save the report. Check your session and Supabase setup.') }
  }

  if (!authReady) return <div className="auth-loading">Opening your research workspace…</div>
  if (!session && authPage === 'welcome') return <WelcomeScreen onSignIn={() => { setAuthPage('auth'); setAuthMode('signin') }} onSignUp={() => { setAuthPage('auth'); setAuthMode('signup') }} installVisible={installVisible} installApp={installApp} dismissInstall={dismissInstall} toast={toast} clearToast={() => setToast('')} />
  if (!session) return <AuthScreen mode={authMode} setMode={mode => { setAuthMode(mode); setAuthError('') }} onBack={() => setAuthPage('welcome')} name={authName} setName={setAuthName} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} onSubmit={submitAuth} busy={authBusy} error={authError} configured={supabaseConfigured} installVisible={installVisible} installApp={installApp} dismissInstall={dismissInstall} toast={toast} clearToast={() => setToast('')} />

  return <div className="app-shell">
    {mobileOpen && <button className="scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-mark" src="/researchpilot-logo-light.png" alt=""/><span>ResearchPilot</span><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={17}/></button></div>
      <div className="nav-label">Workspace</div>
      <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${screen === id || (id === 'papers' && ['summary','methods','chat'].includes(screen)) ? 'active' : ''}`} onClick={() => go(id)}><Icon size={16}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="nav-label">Preferences</div><button className="nav-link muted" onClick={() => setToast('Preferences are coming soon.')}><Settings size={16}/><span>Settings</span></button><button className="nav-link muted" onClick={() => setToast('Help: upload a PDF, explore its sections, and ask questions.')}><CircleHelp size={16}/><span>Help & feedback</span></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19}/></button><span className="workspace-title">Workspace</span><div className="top-actions"><button onClick={() => go('papers')}><Search size={15}/> <span>Search papers</span></button><button className="install-app-action" onClick={installApp}><ArrowDownToLine size={14}/><span>Install app</span></button><span className="top-divider"/><button className="account-button" onClick={signOut} title="Sign out"><span className="avatar">{(session.user.email || 'R')[0].toUpperCase()}</span><span className="account-email">{session.user.email}</span><span>Sign out</span></button></div></header>
      <div className="screen-wrap">{screen === 'overview' && <Overview papers={papers} openPaper={openPaper} go={go} />}{screen === 'upload' && <UploadScreen fileRef={fileRef} upload={upload} uploading={uploading} dragging={dragging} setDragging={setDragging} selectedFile={selectedFile} lang={lang} setLang={setLang} />}{screen === 'papers' && <PapersScreen papers={papers} openPaper={openPaper} go={go} />}{screen === 'summary' && activePaper && <SummaryScreen paper={activePaper} go={go} lang={lang} setLang={setLang} />}{screen === 'methods' && activePaper && <MethodsScreen paper={activePaper} />}{screen === 'chat' && activePaper && <ChatScreen paper={activePaper} messages={messages} query={query} setQuery={setQuery} sendQuestion={sendQuestion} asking={asking} chatRef={chatRef} />}{screen === 'reports' && (activePaper ? <ReportsScreen paper={activePaper} lang={lang} setLang={setLang} selected={selectedSections} setSelected={setSelectedSections} download={downloadReport} /> : <ReportsLibrary reports={reports} papers={papers} openPaper={openPaper} />)}</div>
      <footer className="footer"><span>Concept wireframe&nbsp; | &nbsp;White interface, ink typography, restrained glass surfaces</span><span>RESEARCHPILOT</span></footer>
    </main>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => upload(e.target.files?.[0])}/>
    {installVisible && <div className="install-banner" role="region" aria-label="Install ResearchPilot"><span className="install-icon"><img src="/researchpilot-icon-light-32.png" alt=""/></span><span className="install-copy"><strong>DOWNLOAD OUR WEB APP</strong><small>Install ResearchPilot for a focused reading space.</small></span><button className="btn small" onClick={installApp}>Install</button><button className="icon-button" onClick={dismissInstall} aria-label="Dismiss install prompt"><X size={16}/></button></div>}
    <button className="notification-control" onClick={enableNotifications} title="Enable notifications" aria-label="Enable notifications"><Activity size={16}/></button>
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')} aria-label="Close notification"><X size={14}/></button></div>}
  </div>
}

function AuthScreen({ mode, setMode, onBack, name, setName, email, setEmail, password, setPassword, onSubmit, busy, error, configured, installVisible, installApp, dismissInstall, toast, clearToast }) {
  const signup = mode === 'signup'
  return <main className="auth-page"><section className="auth-card"><button className="auth-brand" onClick={onBack}><img src="/researchpilot-logo-light.png" alt=""/><span>RESEARCHPILOT</span></button><div className="eyebrow">YOUR RESEARCH WORKSPACE</div><h1>{signup ? 'Create your account.' : 'Welcome back.'}</h1><p className="auth-subtitle">{signup ? 'Save your papers, conversations and reports in one private workspace.' : 'Sign in to pick up where your research left off.'}</p>{!configured && <div className="auth-config"><b>Connect your Supabase project</b><span>Add the project URL and publishable key to <code>frontend/.env</code>. Setup steps are in README.md.</span></div>}<form className="auth-form" onSubmit={onSubmit}>{signup && <label>Your name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" placeholder="Name" required/></label>}<label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'} minLength={8} placeholder="At least 8 characters" required/></label>{error && <p className={`auth-message ${error.startsWith('Check your email')?'success':''}`}>{error}</p>}<button className="btn auth-submit" disabled={busy||!configured}>{busy?'Please wait…':signup?'Create account':'Sign in'}<ArrowRight size={15}/></button></form><div className="auth-switch">{signup?'Already have an account?':'New to ResearchPilot?'} <button onClick={()=>setMode(signup?'signin':'signup')}>{signup?'Sign in':'Create account'}</button></div><div className="auth-private"><span className="privacy-dot"/>Your papers and notes stay in your account.</div></section><div className="auth-footer">A private place to read, think and share your research.</div>{installVisible && <div className="install-banner" role="region" aria-label="Install ResearchPilot"><span className="install-icon"><img src="/researchpilot-icon-light-32.png" alt=""/></span><span className="install-copy"><strong>DOWNLOAD OUR WEB APP</strong><small>Install ResearchPilot for a focused reading space.</small></span><button className="btn small" onClick={installApp}>Install</button><button className="icon-button" onClick={dismissInstall} aria-label="Dismiss install prompt"><X size={16}/></button></div>}{toast && <div className="toast"><Check size={16}/>{toast}<button onClick={clearToast} aria-label="Close notification"><X size={14}/></button></div>}</main>
}
function WelcomeScreen({ onSignIn, onSignUp, installVisible, installApp, dismissInstall, toast, clearToast }) {
  return <main className="welcome-page">
    <header className="welcome-nav"><a className="welcome-brand" href="#top"><img src="/researchpilot-logo-light.png" alt=""/><span>RESEARCHPILOT</span></a><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#workspace">Workspace</a></nav><div><button className="welcome-download" onClick={installApp}><ArrowDownToLine size={16}/><span>Download app</span></button><button className="welcome-signin" onClick={onSignIn}>Sign in</button><button className="btn welcome-nav-cta" onClick={onSignUp}>Create account <ArrowRight size={15}/></button></div></header>
    <section className="welcome-hero" id="top"><div className="welcome-copy"><div className="eyebrow">A WORKSPACE FOR RESEARCHERS</div><h1>A BETTER WAY TO READ RESEARCH PAPERS.</h1><p>Move from a dense PDF to a clear understanding. Read the paper, ask grounded questions, and keep your findings in one place.</p><div className="welcome-actions"><button className="btn welcome-primary" onClick={onSignUp}>Start reading <ArrowRight size={15}/></button><button className="welcome-secondary" onClick={onSignIn}>I already have an account</button></div><div className="welcome-proof"><span>PDF in</span><i/><span>Useful notes out</span><i/><span>Sources in view</span></div></div>
      <div className="welcome-preview" aria-label="Example paper summary preview"><div className="preview-top"><span className="preview-file"><span>PDF</span> Attention Is All You Need</span><span className="preview-state">READY TO READ</span></div><div className="preview-body"><div className="preview-label">PAPER SUMMARY</div><h2>Attention is the main idea.</h2><p>The Transformer connects tokens with attention and processes sequences in parallel.</p><div className="preview-divider"/><div className="preview-citation"><span className="citation-dot"/><span><b>Key point</b><small>Self-attention replaces recurrence.</small></span><button aria-label="Source page">p. 3</button></div><div className="preview-question"><span>Ask this paper</span><span>What does the method change? <ArrowRight size={13}/></span></div></div></div>
    </section>
    <section className="welcome-details" id="workspace"><div><div className="eyebrow">READ WITH THE SOURCE IN VIEW</div><h2>Keep the reasoning close to the paper.</h2></div><div className="welcome-feature-list"><article><span>01</span><div><h3>Read the argument</h3><p>See the paper’s objective, key points, methods and stated limitations together.</p></div></article><article><span>02</span><div><h3>Ask about the text</h3><p>Get answers grounded in retrieved passages, with references alongside.</p></div></article><article><span>03</span><div><h3>Keep your work</h3><p>Your papers, conversations and reports stay saved in your private account.</p></div></article></div></section>
    <section className="welcome-how" id="how-it-works"><div className="eyebrow">A SIMPLE WORKFLOW</div><div className="how-steps"><div><span>01</span><b>Upload a PDF</b></div><div><span>02</span><b>Explore the evidence</b></div><div><span>03</span><b>Save a report</b></div></div></section>
    <footer className="welcome-footer"><span>RESEARCHPILOT</span><span>Read closely. Keep the evidence.</span><button onClick={onSignIn}>Sign in <ArrowRight size={13}/></button></footer>
    {installVisible && <div className="install-banner" role="region" aria-label="Install ResearchPilot"><span className="install-icon"><img src="/researchpilot-icon-light-32.png" alt=""/></span><span className="install-copy"><strong>DOWNLOAD OUR WEB APP</strong><small>Install ResearchPilot for a focused reading space.</small></span><button className="btn small" onClick={installApp}>Install</button><button className="icon-button" onClick={dismissInstall} aria-label="Dismiss install prompt"><X size={16}/></button></div>}
  </main>
}
function PageHeading({ eyebrow, title, subtitle, children }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div> }
function Overview({ papers, openPaper, go }) { return <>
  <PageHeading eyebrow="Your workspace" title="A BETTER WAY TO READ RESEARCH PAPER" subtitle="A single workspace for papers, notes and finished reports." />
  <section className="welcome-bar"><div><h2>Good afternoon</h2><p>Pick up a paper or start a fresh analysis.</p></div><button className="btn" onClick={() => go('upload')}><Plus size={16}/> Upload paper</button></section>
  <section className="stat-grid"><Stat number={String(papers.length).padStart(2,'0')} title="Papers in your library" note="Saved to your account"/><Stat number="—" title="Reports ready" note="Stored in your account"/><Stat number="—" title="Reading session" note="Pick up any time"/></section>
  <section className="panel recent-panel"><div className="panel-head"><h3>Recent papers</h3><button className="text-button" onClick={() => go('papers')}>View all papers <ArrowRight size={13}/></button></div><div className="paper-list">{papers.length ? papers.slice(0,3).map(p => <PaperRow key={p.id} paper={p} onClick={() => openPaper(p)}/>) : <div className="empty-library"><span>Your library is ready for its first paper.</span><button className="inline-link" onClick={() => go('upload')}>Upload a PDF <ArrowRight size={13}/></button></div>}</div></section>
 </> }
function ReportsLibrary({ reports, papers, openPaper }) { return <><PageHeading eyebrow="Your account" title="Saved reports" subtitle="Reports generated from your papers are stored in your private account."/><section className="panel library-panel"><div className="panel-head"><h3>{reports.length} saved reports</h3></div>{reports.length ? reports.map(report=><div className="saved-report" key={report.id}><span className="pdf-icon">PDF</span><span><b>{report.title}</b><small>{report.language} · {(report.sections||[]).length} sections · {new Date(report.created_at).toLocaleDateString()}</small></span><button className="inline-link" onClick={()=>{const paper=papers.find(p=>p.id===report.paper_id);if(paper)openPaper(paper)}}>Open paper <ArrowRight size={13}/></button></div>) : <div className="empty-library"><span>No reports yet. Choose a paper to create one.</span></div>}</section></> }
function Stat({ number, title, note }) { return <div className="stat-card"><strong>{number}</strong><div><b>{title}</b><small>{note}</small></div></div> }
function PaperRow({ paper, onClick }) { return <button className="paper-row" onClick={onClick}><span className="pdf-icon">PDF</span><span className="paper-name"><b>{paper.title}</b><small>{paper.author || 'Uploaded paper'} · {paper.pages} pages</small></span><span className={`status ${(paper.status || 'Analysed').toLowerCase().replace(' ','-')}`}>{paper.status || 'Analysed'}</span></button> }
function UploadScreen({ fileRef, upload, uploading, dragging, setDragging, selectedFile, lang, setLang }) { return <>
  <PageHeading eyebrow="Flow 01" title="Add a research paper." subtitle="Keep the first step simple. One file, one language preference, one clear action." />
  <section className="upload-intro panel"><span className="upload-symbol"><Upload size={20}/></span><div><h3>Upload your paper</h3><p>PDF format · Up to 30 MB · One paper per analysis</p></div></section>
  <button className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={e => {e.preventDefault();setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault();setDragging(false);upload(e.dataTransfer.files?.[0])}}><span className="pdf-large">PDF</span><b>{uploading ? 'Reading your paper…' : selectedFile?.name || 'Drop your PDF here'}</b><small>{uploading ? 'Extracting text and preparing your workspace' : 'or browse files from your device'}</small></button>
  <section className="language-box panel"><div><b>Explanation language</b><small>You can change this later.</small></div><LanguageToggle lang={lang} setLang={setLang}/></section>
  <div className="action-row"><span className="quiet-note">Your PDF stays in this browser session.</span><button className="btn" disabled={uploading || !selectedFile} onClick={() => upload(selectedFile)}>{uploading ? 'Analysing…' : 'Start analysis'} <ArrowRight size={15}/></button></div>
 </> }
function LanguageToggle({ lang, setLang }) { return <div className="segmented"><button className={lang==='English'?'selected':''} onClick={() => setLang('English')}>English</button><button className={lang==='Hinglish'?'selected':''} onClick={() => setLang('Hinglish')}>Hinglish</button></div> }
function PapersScreen({ papers, openPaper, go }) { return <><PageHeading eyebrow="Your library" title="My papers" subtitle="Return to a paper and pick up where you left off."><button className="btn" onClick={() => go('upload')}><Plus size={16}/> Add a paper</button></PageHeading><section className="panel library-panel"><div className="panel-head"><h3>{papers.length} papers in your workspace</h3><button className="filter-button"><span>Most recent</span><ChevronDown size={14}/></button></div><div className="paper-list">{papers.map(p => <PaperRow key={p.id} paper={p} onClick={() => openPaper(p)}/>)}</div></section></> }
function SummaryScreen({ paper, go, lang, setLang }) { const tabs = [['summary','Overview'],['summary','Key points'],['methods','Methodology'],['methods','Limitations'],['chat','Ask paper'],['reports','Final report']]; return <>
  <div className="paper-header"><span className="pdf-icon">PDF</span><div><h2>{paper.title}</h2><p>{paper.author} · {paper.pages} pages</p></div><span className="status analysed">Analysed</span></div>
  <nav className="section-tabs">{tabs.map(([id,label],i) => <button key={label} className={i===0?'selected':''} onClick={() => go(id)}>{label}</button>)}</nav>
  <section className="panel summary-card"><div className="panel-head"><h3>Paper summary</h3><span className="pill blue">{lang.toUpperCase()}</span></div><p>{paper.summary}</p></section>
  <div className="insight-grid"><article className="panel insight"><span className="pill blue">Objective</span><p>{paper.objective}</p></article><article className="panel insight"><span className="pill green">Finding</span><p>{paper.finding}</p></article></div>
  <section className="panel glance"><h3>Method at a glance</h3><div className="glance-grid"><div><small>Architecture</small><b>{paper.architecture}</b></div><div><small>Core mechanism</small><b>{paper.core}</b></div><div><small>Evaluation</small><b>{paper.evaluation}</b></div></div><button className="inline-link" onClick={() => go('methods')}>Explore methodology <ArrowRight size={13}/></button></section>
 </> }
function MethodsScreen({ paper }) { return <><PageHeading eyebrow="Flow 02 · Paper details" title="Inspect methods and limitations." subtitle="Separate what the authors report from what the analysis infers."/><section className="panel method-card"><div className="panel-head"><div><h3>Methodology</h3><p>The authors use an encoder-decoder Transformer. Both components stack attention and feed-forward layers. The model uses positional encodings to represent token order.</p></div><span className="pill blue">From the paper</span></div><div className="method-steps">{paper.method.map((step,i)=><div className="method-step" key={step}><span>{String(i+1).padStart(2,'0')}</span><b>{step}</b></div>)}</div></section><div className="insight-grid limitation-grid"><article className="panel"><span className="pill green">Directly reported</span><h3>Author-stated limitations</h3><p>Use this area for limitations the paper names in its discussion or conclusion. Keep quoted evidence and page references visible.</p><button className="inline-link">View source passages <ArrowRight size={13}/></button></article><article className="panel"><span className="pill amber">AI-inferred</span><h3>Potential research gaps</h3><p>Show inferences from the method, dataset or evaluation. Label each inference and link it to supporting passages.</p><button className="inline-link">Ask about a limitation <ArrowRight size={13}/></button></article></div><section className="panel takeaway"><FlaskConical size={17}/><span><b>Method at a glance</b><small>{paper.architecture} · {paper.core} · {paper.evaluation}</small></span></section></> }
function ChatScreen({ paper, messages, query, setQuery, sendQuestion, asking, chatRef }) { const prompts=['What is the main contribution?','Explain self-attention simply.','What are the limitations?']; return <><PageHeading eyebrow="Flow 04 · Ask the paper" title="Ask the paper a question." subtitle="A focused chat sits beside the source, with page references attached to answers."/><section className="chat-workspace panel"><div className="document-pane"><div className="pane-label"><span>Document</span><span className="pdf-icon">PDF</span></div><h3>{paper.title}</h3><p>{paper.author} · {paper.pages} pages</p><div className="skeleton-lines"><i/><i/><i/><i/></div><div className="source-highlight">Attention lets the model process tokens in parallel.</div><div className="skeleton-lines short"><i/><i/><i/></div><span className="page-chip">Page 03</span></div><div className="chat-pane"><div className="chat-heading"><div><small>Ask this paper</small><h3>ResearchPilot</h3></div><span className="online-dot">Paper ready</span></div><div className="chat-messages" ref={chatRef}>{messages.length === 0 ? <div className="assistant-message"><p>Ask a question about <b>{paper.title}</b>. Answers are grounded in the paper with source references.</p><div className="prompt-list">{prompts.map(p=><button key={p} onClick={() => setQuery(p)}>{p}<ArrowRight size={12}/></button>)}</div></div> : messages.map((m,i)=><div className={`message ${m.role}`} key={i}><b>{m.role==='assistant'?'ResearchPilot':'You'}</b><p>{m.text}</p>{m.sources?.map((s,j)=><span className="source-ref" key={j}>{Number.isInteger(s.page)?`Page ${s.page}`:`Source excerpt ${j+1}`}</span>)}</div>)}{asking&&<div className="message assistant"><b>ResearchPilot</b><p className="typing">Finding relevant passages…</p></div>}</div><form className="chat-form" onSubmit={sendQuestion}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask a question about this paper…"/><button className="send-button" aria-label="Send question" disabled={asking||!query.trim()}><ArrowRight size={16}/></button></form><div className="chat-footnote">Answers include references from your paper.</div></div></section></> }
function ReportsScreen({ paper, lang, setLang, selected, setSelected, download }) { const options=['Executive summary','Examples','Research objectives','Limitations','Methodology','Future research','Key findings','References']; const toggle = item => setSelected(prev => prev.includes(item)?prev.filter(x=>x!==item):[...prev,item]); return <><PageHeading eyebrow="Flow 05 · Export" title="Create a report you can share." subtitle="Choose the language and sections. Preview the document before downloading."/><div className="report-layout"><section className="panel report-settings"><h3>Report settings</h3><div className="setting-block"><b>Language</b><LanguageToggle lang={lang} setLang={setLang}/></div><div className="setting-block"><b>Include sections</b><div className="check-grid">{options.map(item=><label key={item}><input type="checkbox" checked={selected.includes(item)} onChange={()=>toggle(item)}/><span>{item}</span></label>)}</div></div><button className="btn full" onClick={download}>Generate report <ArrowRight size={15}/></button></section><section className="panel preview-panel"><div className="preview-heading"><div><small>Report preview</small><span>{paper.pages} pages · PDF</span></div><span className="pill blue">Preview</span></div><div className="report-page"><div className="report-brand"><img src="/researchpilot-icon-light-32.png" alt=""/><small>RESEARCHPILOT</small></div><h2>Research Analysis</h2><p>{paper.title}</p><div className="report-rule"/>{selected.slice(0,3).map((s,i)=><div className="report-section" key={s}><b>{String(i+1).padStart(2,'0')} &nbsp; {s}</b><i/><i/></div>)}</div></section></div></> }

createRoot(document.getElementById('root')).render(<App />)
