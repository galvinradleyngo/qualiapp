const sampleCodes = [
  {
    name: 'Participant language preserved',
    note: 'In-vivo validation keeps labels tied to selected quotes.',
  },
  {
    name: 'Code mode only panel',
    note: 'Right-side coding tools appear only in coding context.',
  },
  {
    name: 'Legacy-safe migration',
    note: 'Behavior is recreated here before any cutover decision.',
  },
]

export function TranscriptWorkspace() {
  return (
    <section className="workspace-panel" aria-labelledby="transcript-workspace-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Editor track</p>
          <h3 id="transcript-workspace-heading">Transcript coding workbench</h3>
          <p className="panel-copy">
            First migration target: preserve transcript review, code mode, and in-vivo checks in a native-feeling shell.
          </p>
        </div>
        <div className="segment-row" aria-label="Transcript modes">
          <button type="button">Read</button>
          <button type="button" className="segment-active">
            Code
          </button>
          <button type="button">Review</button>
        </div>
      </div>

      <div className="transcript-preview">
        <figure className="quote-card">
          <blockquote>
            “I needed the code label to use the participant’s exact phrase, otherwise it stopped feeling trustworthy.”
          </blockquote>
          <figcaption>Highlighted excerpt from migrated transcript preview</figcaption>
        </figure>

        <div className="code-panel">
          <div className="code-toolbar">
            <div className="toggle-chip">In-vivo mode on</div>
            <p className="hint">The coding panel remains visible only while the transcript is in code mode.</p>
          </div>

          <div className="code-list">
            {sampleCodes.map((code) => (
              <article className="code-item" key={code.name}>
                <span className="code-dot" aria-hidden="true" />
                <div>
                  <strong>{code.name}</strong>
                  <span>{code.note}</span>
                </div>
                <button type="button" className="code-action">
                  Inspect
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>

      <section className="storage-panel" aria-labelledby="storage-compat-heading">
        <div className="storage-row">
          <div>
            <h4 id="storage-compat-heading">Storage compatibility checkpoint</h4>
            <p className="storage-copy">
              Keep legacy local data importable here before any UI cutover or desktop packaging step.
            </p>
          </div>
          <div className="toggle-chip">IndexedDB parity</div>
        </div>
        <div className="storage-row">
          <span>Database strategy</span>
          <strong>Mirror existing local-first schema first</strong>
        </div>
        <div className="storage-row">
          <span>Import path</span>
          <strong>Support backup restore before native-only features</strong>
        </div>
      </section>
    </section>
  )
}
