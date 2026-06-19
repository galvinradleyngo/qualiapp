export function PomodoroWidget() {
  return (
    <aside className="widget-panel" aria-labelledby="pomodoro-widget-heading">
      <div className="widget-header">
        <div>
          <p className="eyebrow">Floating utility</p>
          <h3 id="pomodoro-widget-heading">Pomodoro mini panel</h3>
          <p className="widget-note">
            Native-style timer surface for the floating tomato workflow before deeper state migration.
          </p>
        </div>
        <div className="widget-pill">Patch-ready</div>
      </div>

      <section className="timer-display" aria-label="Pomodoro preview">
        <div className="timer-label">
          <span>Focus session</span>
          <span>Upper-right floating control</span>
        </div>
        <p className="timer-value">25:00</p>
        <div className="control-row">
          <button type="button" className="control-primary">
            Start
          </button>
          <button type="button" className="control-secondary">
            Pause
          </button>
          <button type="button" className="control-secondary">
            Reset
          </button>
        </div>
      </section>

      <div className="widget-stack">
        <section className="widget-card">
          <div className="widget-stat">
            <div>
              <span>Update model</span>
              <strong>One-click patching</strong>
            </div>
            <div className="widget-pill">Rollback</div>
          </div>
          <p className="widget-text">
            Native releases will use signed incremental updates with a stable fallback if startup health checks fail.
          </p>
        </section>

        <section className="widget-card">
          <div className="widget-stat">
            <div>
              <span>Future-proofing</span>
              <strong>macOS change resilience</strong>
            </div>
            <div className="widget-pill">No private APIs</div>
          </div>
          <p className="widget-text">
            Visual tokens, packaging rules, and compatibility checks stay centralized so OS updates require smaller patches.
          </p>
        </section>

        <section className="widget-card">
          <div className="widget-stat">
            <div>
              <span>Future track</span>
              <strong>Windows readiness only</strong>
            </div>
            <div className="widget-pill">Deferred</div>
          </div>
          <div className="timeline" aria-label="Future platform readiness">
            <button type="button">MSI/EXE</button>
            <button type="button">Code signing</button>
            <button type="button">Win 10/11 matrix</button>
          </div>
        </section>
      </div>
    </aside>
  )
}
