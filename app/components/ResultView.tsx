"use client";

import { useMemo, useRef, useState } from "react";
import type { AnalyzeResponse } from "@/contract";
import { failureText } from "@/ui/explain";
import { groupFindings, marksFor, pluralize, resultsOf, toFindings, type Finding } from "@/ui/view";
import { FindingCard } from "./FindingCard";
import { TranscriptPane } from "./TranscriptPane";

interface Props {
  response: AnalyzeResponse;
  onBack: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll a transcript pane (its own scroll container) so the first highlight of `key` is in view. */
function scrollPaneTo(pane: HTMLDivElement | null, key: string) {
  if (!pane) return;
  const el = pane.querySelector(`[data-keys~="${key}"]`);
  if (!el) return;
  const top = pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientHeight / 3;
  pane.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function ResultView({ response, onBack }: Props) {
  const { run, transcripts, mode } = response;
  const findings = useMemo(() => toFindings(resultsOf(run)), [run]);
  const groups = useMemo(() => groupFindings(findings), [findings]);
  const marksA = useMemo(() => marksFor(findings, "A"), [findings]);
  const marksB = useMemo(() => marksFor(findings, "B"), [findings]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dismissedOpen, setDismissedOpen] = useState(false);
  const paneA = useRef<HTMLDivElement | null>(null);
  const paneB = useRef<HTMLDivElement | null>(null);

  const activeKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of [hovered, focused, selected]) if (k !== null) s.add(k);
    return s;
  }, [hovered, focused, selected]);

  function selectCard(key: string) {
    setSelected(key);
    scrollPaneTo(paneA.current, key);
    scrollPaneTo(paneB.current, key);
  }

  function selectFromHighlight(key: string) {
    setSelected(key);
    const card = document.getElementById(`card-${key}`);
    if (!card) return;
    card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    card.focus({ preventScroll: true });
  }

  const renderCards = (list: readonly Finding[]) =>
    list.map((f) => (
      <FindingCard
        key={f.key}
        finding={f}
        transcripts={transcripts}
        selected={selected === f.key}
        onHover={setHovered}
        onFocusCard={setFocused}
        onSelect={selectCard}
      />
    ));

  const toolbar = (
    <div className="result-toolbar">
      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Edit transcripts
      </button>
    </div>
  );

  const replayBanner =
    mode === "replay" ? (
      <p className="notice notice-info" role="note">
        Sample analysed from a saved extraction — no LLM call was made.
      </p>
    ) : null;

  if (run.status === "failed") {
    return (
      <div className="result-view">
        {toolbar}
        {replayBanner}
        <section className="notice notice-error failure" role="alert">
          <h2>Analysis failed</h2>
          <p>{failureText(run.reason)}</p>
          <p className="small">
            Reason code <code>{run.reason}</code>
            {run.detail && (
              <>
                {" "}
                · Detail: <span className="detail">{run.detail}</span>
              </>
            )}
          </p>
          <p className="small">No results are shown because the analysis did not complete. You can edit the transcripts and try again.</p>
        </section>
      </div>
    );
  }

  const nContra = groups.contradictions.length;
  const summary = [
    pluralize(nContra, "contradiction", "contradictions"),
    `${groups.needsReview.length} need${groups.needsReview.length === 1 ? "s" : ""} review`,
    `${groups.dismissed.length} dismissed`,
    ...(groups.errors.length > 0 ? [pluralize(groups.errors.length, "analysis error", "analysis errors")] : []),
  ].join(" · ");

  return (
    <div className="result-view">
      {toolbar}
      {replayBanner}

      {run.status === "completed_partial" && (
        <p className="notice notice-warn" role="status">
          Partially completed: {pluralize(run.errorCount, "candidate", "candidates")} could not be analysed (see Analysis errors).
          The other results are complete.
        </p>
      )}

      <div className="result-layout">
        <div className="findings">
          {run.status === "completed_empty" ? (
            <section className="empty">
              <h2>No candidates found in this analysis</h2>
              <p>
                This does not guarantee that nothing was missed. The rules cover a deliberately narrow set of contradiction
                types, and fact extraction can overlook statements.
              </p>
            </section>
          ) : (
            <>
              <p className="summary">{summary}</p>

              <section className="group" aria-labelledby="g-contra">
                <h2 id="g-contra">Contradictions</h2>
                {nContra === 0 ? <p className="muted">No contradictions were found.</p> : renderCards(groups.contradictions)}
              </section>

              {groups.needsReview.length > 0 && (
                <section className="group" aria-labelledby="g-review">
                  <h2 id="g-review">Needs review</h2>
                  <p className="group-note">The rules could not decide these pairs. They are not scored.</p>
                  {renderCards(groups.needsReview)}
                </section>
              )}

              {groups.dismissed.length > 0 && (
                <details
                  className="group group-dismissed"
                  open={dismissedOpen}
                  onToggle={(e) => setDismissedOpen(e.currentTarget.open)}
                >
                  <summary>
                    <h2>Dismissed as false positives ({groups.dismissed.length})</h2>
                  </summary>
                  <p className="group-note">The rules found these statements compatible. They are not scored.</p>
                  {renderCards(groups.dismissed)}
                </details>
              )}

              {groups.errors.length > 0 && (
                <section className="group" aria-labelledby="g-errors">
                  <h2 id="g-errors">Analysis errors</h2>
                  {renderCards(groups.errors)}
                </section>
              )}
            </>
          )}
        </div>

        <div className="transcripts">
          <ul className="legend" aria-label="Highlight legend">
            <li>
              <span className="hl hl-contradiction">text</span> Contradiction
            </li>
            <li>
              <span className="hl hl-review">text</span> Needs review
            </li>
          </ul>
          <div className="transcript-columns">
            <TranscriptPane id="A" text={transcripts.A} marks={marksA} activeKeys={activeKeys} onSelect={selectFromHighlight} paneRef={paneA} />
            <TranscriptPane id="B" text={transcripts.B} marks={marksB} activeKeys={activeKeys} onSelect={selectFromHighlight} paneRef={paneB} />
          </div>
        </div>
      </div>
    </div>
  );
}
