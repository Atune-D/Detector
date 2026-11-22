"use client";

import { useMemo, type KeyboardEvent, type RefObject } from "react";
import type { TranscriptId } from "@/engine";
import { buildSegments, segmentTone, type Mark } from "@/ui/segments";

interface Props {
  id: TranscriptId;
  text: string;
  marks: readonly Mark[];
  /** Finding keys whose highlights are emphasised (hovered, focused or selected). */
  activeKeys: ReadonlySet<string>;
  onSelect: (key: string) => void;
  paneRef: RefObject<HTMLDivElement | null>;
}

const TONE_LABEL = { contradiction: "Contradiction", review: "Needs review", dismissed: "Dismissed" } as const;

export function TranscriptPane({ id, text, marks, activeKeys, onSelect, paneRef }: Props) {
  // Segments are built only from offsets; the text is never searched for quotes.
  const segments = useMemo(() => buildSegments(text, marks), [text, marks]);

  return (
    <section className="transcript" aria-labelledby={`transcript-${id}-title`}>
      <h3 id={`transcript-${id}-title`} className="transcript-title">
        Transcript {id}
      </h3>
      <div className="transcript-body" ref={paneRef} tabIndex={0} aria-label={`Transcript ${id}, read-only`}>
        {segments.length === 0 ? (
          <p className="muted">(empty)</p>
        ) : (
          segments.map((s) => {
            const tone = segmentTone(s);
            const first = s.marks[0];
            if (tone === null || first === undefined) return <span key={s.start}>{s.text}</span>;
            const keys = s.marks.map((m) => m.id);
            const active = keys.some((k) => activeKeys.has(k));
            const cls = `hl hl-${tone}${active ? " is-active" : ""}`;
            if (tone === "dismissed") {
              // False positives are not highlighted unless their card is active.
              return (
                <span key={s.start} className={cls} data-keys={keys.join(" ")}>
                  {s.text}
                </span>
              );
            }
            const select = () => onSelect(first.id);
            const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select();
              }
            };
            return (
              <mark
                key={s.start}
                className={cls}
                data-keys={keys.join(" ")}
                role="button"
                tabIndex={0}
                title={`${TONE_LABEL[tone]}. Select to show the finding.`}
                onClick={select}
                onKeyDown={onKeyDown}
              >
                {s.text}
              </mark>
            );
          })
        )}
      </div>
    </section>
  );
}
