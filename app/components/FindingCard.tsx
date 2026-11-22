"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import type { TranscriptId } from "@/engine";
import { OUTCOME_TEXT, errorText, explainAssumption, explainMissing, factContext, ruleText, type Explanation } from "@/ui/explain";
import { categoryLabel, deductionText, factsOf, quoteView, scoreDisplay, type Finding } from "@/ui/view";

interface Props {
  finding: Finding;
  transcripts: Readonly<Record<TranscriptId, string>>;
  selected: boolean;
  onHover: (key: string | null) => void;
  onFocusCard: (key: string | null) => void;
  onSelect: (key: string) => void;
}

function ExplanationText({ e }: { e: Explanation }) {
  if (!e.known) return <code>{e.raw}</code>;
  return (
    <>
      {e.text}
      {e.detail !== null && <span className="detail"> ({e.detail})</span>}
    </>
  );
}

export function FindingCard({ finding, transcripts, selected, onHover, onFocusCard, onSelect }: Props) {
  const r = finding.result;
  const ctx = factContext(r);
  const score = scoreDisplay(r);
  const assumptions = r.record?.assumptions ?? r.compare?.assumptions ?? [];
  const missing = r.record?.missingConditions ?? r.compare?.missingConditions ?? [];
  const ruleId = r.record?.ruleId ?? r.compare?.ruleId ?? null;
  const deduction = deductionText(r, transcripts);
  const quotes = factsOf(r).map((f) => quoteView(f, transcripts));

  // Opening the details disclosure should not also scroll the transcripts.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest("summary")) return;
    onSelect(finding.key);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(finding.key);
    }
  };

  return (
    <article
      id={`card-${finding.key}`}
      className={`card card-${r.category}${selected ? " is-selected" : ""}`}
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={`${categoryLabel(r.category)}${score.kind === "score" ? `, score ${score.text}` : ""}`}
      onMouseEnter={() => onHover(finding.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onFocusCard(finding.key)}
      onBlur={() => onFocusCard(null)}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <header className="card-head">
        <span className={`category category-${r.category}`}>{categoryLabel(r.category)}</span>
        {assumptions.length > 0 && <span className="tag tag-policy">Depends on default policy</span>}
        {score.kind === "score" ? (
          <span className="score" title="Rule score (not a probability)">
            <span className="visually-hidden">Score </span>
            {score.text}
          </span>
        ) : (
          <span className="status">{score.text}</span>
        )}
      </header>

      <div className="quotes">
        {quotes.map((q) => (
          <figure key={q.transcript} className="quote">
            <figcaption>
              Transcript {q.transcript}
              {q.question && <span className="question"> · Q: {q.question}</span>}
            </figcaption>
            <blockquote className={q.located ? undefined : "not-located"}>{q.text}</blockquote>
            {!q.located && <p className="muted small">This passage was not found at its stated position.</p>}
          </figure>
        ))}
      </div>

      <dl className="facts">
        {ruleId !== null && (
          <>
            <dt>Rule</dt>
            <dd>
              {ruleText(ruleId)}
              {r.compare && <span className="outcome"> {OUTCOME_TEXT[r.compare.result]}</span>}
            </dd>
          </>
        )}
        {deduction !== null && (
          <>
            <dt>Uncertainty</dt>
            <dd>
              {deduction}
              {r.record?.baseScore != null && (
                <span className="muted"> (base score {r.record.baseScore})</span>
              )}
            </dd>
          </>
        )}
        {missing.length > 0 && (
          <>
            <dt>Missing</dt>
            <dd>
              <ul className="plain-list">
                {missing.map((m) => (
                  <li key={m}>
                    <ExplanationText e={explainMissing(m, ctx)} />
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {r.errors.length > 0 && (
          <>
            <dt>Error</dt>
            <dd>
              <ul className="plain-list">
                {r.errors.map((e, i) => (
                  <li key={`${e.factId}-${i}`}>
                    {errorText(e.code)}{" "}
                    <span className="detail">
                      (Transcript {ctx.get(e.factId) ?? "?"}: {e.detail})
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {(assumptions.length > 0 || r.record) && (
        <details className="card-details">
          <summary>Details</summary>
          {assumptions.length > 0 && (
            <>
              <p className="small">
                This conclusion relies on default policy values. The score means the conflict rule is met under the current
                policy, not that the testimony itself confirms it.
              </p>
              <ul className="plain-list">
                {assumptions.map((a) => (
                  <li key={a}>
                    <ExplanationText e={explainAssumption(a, ctx)} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.record && (
            <p className="muted small">
              Rule <code>{r.record.ruleId}</code> · policy <code>{r.record.policyVersion}</code>
            </p>
          )}
        </details>
      )}
    </article>
  );
}
