import { useState } from 'react'
import './App.css'
import { TranscriptWorkspace } from './features/editor/TranscriptWorkspace'
import { PomodoroWidget } from './features/pomodoro/PomodoroWidget'

const views = [
  {
    id: 'overview',
    label: 'Overview',
    eyebrow: 'Migration',
    title: 'macOS-first workspace',
    body:
      'This isolated app track mirrors the legacy workflow without modifying the current root files.',
  },
  {
    id: 'transcripts',
    label: 'Transcripts',
    eyebrow: 'Feature parity',
    title: 'Transcript coding workbench',
    body:
      'Build the code-mode experience, in-vivo validation, and transcript inspection here before cutover.',
  },
  {
    id: 'release',
    label: 'Release',
    eyebrow: 'Distribution',
    title: 'Signed patchable macOS app',
    body:
      'This track will add patch updates, rollback protection, and notarized release automation after core parity.',
  },
] as const

function App() {
  const [activeView, setActiveView] = useState<(typeof views)[number]['id']>('overview')

  const currentView = views.find((view) => view.id === activeView) ?? views[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="traffic-lights" aria-hidden="true">
          <span className="traffic-light traffic-light-close" />
          <span className="traffic-light traffic-light-minimize" />
          <span className="traffic-light traffic-light-expand" />
        </div>
        <div className="sidebar-header">
          <p className="eyebrow">QualiApp Native</p>
          <h1>macOS track</h1>
          <p className="supporting-text">
            Parallel workspace for the desktop app. Legacy root files remain untouched.
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`nav-item ${view.id === activeView ? 'nav-item-active' : ''}`}
              onClick={() => setActiveView(view.id)}
            >
              <span className="nav-item-label">{view.label}</span>
              <span className="nav-item-meta">{view.eyebrow}</span>
            </button>
          ))}
        </nav>

        <section className="sidebar-card">
          <p className="sidebar-card-title">Migration guardrails</p>
          <ul className="sidebar-list">
            <li>Root app stays unchanged during macOS implementation.</li>
            <li>Storage compatibility remains local-first and offline-first.</li>
            <li>Windows support stays planning-only until macOS stabilizes.</li>
          </ul>
        </section>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h2>{currentView.title}</h2>
          </div>
          <div className="status-pill">Build-ready scaffold</div>
        </header>

        <section className="hero-panel">
          <div>
            <p className="hero-kicker">{currentView.label}</p>
            <p className="hero-copy">{currentView.body}</p>
          </div>
          <div className="hero-metrics" aria-label="Implementation status">
            <article>
              <span>Track</span>
              <strong>macOS first</strong>
            </article>
            <article>
              <span>Updates</span>
              <strong>Patchable</strong>
            </article>
            <article>
              <span>Storage</span>
              <strong>IndexedDB parity</strong>
            </article>
          </div>
        </section>

        <div className="workspace-grid">
          <TranscriptWorkspace />
          <PomodoroWidget />
        </div>
      </main>
    </div>
  )
}

export default App
