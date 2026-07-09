import { useEffect, useMemo, useState } from 'react'

const MIN_DURATION = 1
const MAX_DURATION = 180

function formatPomodoroTime(totalSeconds: number): string {
  const safe = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function PomodoroWidget() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(20)
  const [remainingSeconds, setRemainingSeconds] = useState(20 * 60)
  const [isRunning, setIsRunning] = useState(false)

  const timerLabel = useMemo(() => formatPomodoroTime(remainingSeconds), [remainingSeconds])

  useEffect(() => {
    if (!isRunning) return

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId)
          setIsRunning(false)
          return 0
        }
        return previous - 1
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isRunning])

  const adjustMinutes = (delta: number) => {
    if (isRunning) return
    const next = Math.min(MAX_DURATION, Math.max(MIN_DURATION, durationMinutes + delta))
    setDurationMinutes(next)
    setRemainingSeconds(next * 60)
  }

  const startTimer = () => {
    setRemainingSeconds((previous) => (previous > 0 ? previous : durationMinutes * 60))
    setIsRunning(true)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setRemainingSeconds(durationMinutes * 60)
  }

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
        <button type="button" className="widget-pill widget-toggle" onClick={() => setIsExpanded((prev) => !prev)}>
          <span aria-hidden="true">🍅</span>
          {isRunning ? timerLabel : isExpanded ? 'Minimize' : 'Open'}
        </button>
      </div>

      {isExpanded && (
        <>
          <section className="timer-display" aria-label="Pomodoro preview">
            <div className="timer-label">
              <span>Focus session</span>
              <span>Header-anchored control</span>
            </div>
            <p className="timer-value">{timerLabel}</p>
            <p className="hint">{isRunning ? 'Running' : 'Ready'}</p>
            <div className="pomodoro-adjust-row">
              <button type="button" className="control-secondary" onClick={() => adjustMinutes(-5)} disabled={isRunning}>
                -5m
              </button>
              <span className="pomodoro-duration-label">{durationMinutes} min</span>
              <button type="button" className="control-secondary" onClick={() => adjustMinutes(5)} disabled={isRunning}>
                +5m
              </button>
            </div>
            <div className="control-row">
              {!isRunning ? (
                <button type="button" className="control-primary" onClick={startTimer}>
                  Start
                </button>
              ) : (
                <button type="button" className="control-primary" onClick={() => setIsRunning(false)}>
                  Pause
                </button>
              )}
              <button type="button" className="control-secondary" onClick={resetTimer}>
                Reset
              </button>
              <button type="button" className="control-secondary" onClick={() => setIsExpanded(false)}>
                Minimize
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
        </>
      )}

      {!isExpanded && !isRunning && <p className="hint">Pomodoro minimized. Expand to edit session length.</p>}
    </aside>
  )
}
