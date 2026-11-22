"use client";

interface Props {
  transcriptA: string;
  transcriptB: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
  onAnalyze: () => void;
  onLoadSample: () => void;
  onCancel: () => void;
  analyzing: boolean;
  loadingSample: boolean;
  error: string | null;
}

export function InputView(p: Props) {
  const busy = p.analyzing || p.loadingSample;
  const empty = p.transcriptA.trim() === "" || p.transcriptB.trim() === "";

  return (
    <form
      className="input-view"
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        p.onAnalyze();
      }}
    >
      <div className="columns">
        <div className="field">
          <label htmlFor="transcript-a">Transcript A</label>
          <textarea
            id="transcript-a"
            value={p.transcriptA}
            onChange={(e) => p.onChangeA(e.target.value)}
            readOnly={busy}
            spellCheck={false}
            placeholder="Paste the earlier deposition transcript here."
          />
        </div>
        <div className="field">
          <label htmlFor="transcript-b">Transcript B</label>
          <textarea
            id="transcript-b"
            value={p.transcriptB}
            onChange={(e) => p.onChangeB(e.target.value)}
            readOnly={busy}
            spellCheck={false}
            placeholder="Paste the later deposition transcript here."
          />
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || empty}>
          Find contradictions
        </button>
        <button type="button" className="btn btn-secondary" onClick={p.onLoadSample} disabled={busy}>
          {p.loadingSample ? "Loading sample…" : "Load sample"}
        </button>
        {p.analyzing && (
          <>
            <span className="progress" role="status">
              <span className="spinner" aria-hidden="true" />
              Analysing transcripts. Live extraction can take up to a minute.
            </span>
            <button type="button" className="btn btn-link" onClick={p.onCancel}>
              Cancel
            </button>
          </>
        )}
        {!busy && empty && <span className="hint">Fill in both transcripts, or load the sample.</span>}
      </div>

      {p.error && (
        <p className="notice notice-error" role="alert">
          {p.error}
        </p>
      )}
    </form>
  );
}
