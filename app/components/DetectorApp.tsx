"use client";

import { useRef, useState } from "react";
import type { AnalyzeResponse } from "@/contract";
import { getSample, postAnalyze } from "@/ui/api";
import { InputView } from "./InputView";
import { ResultView } from "./ResultView";

type Busy = "idle" | "analyzing" | "loading-sample";

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

export function DetectorApp() {
  const [transcriptA, setTranscriptA] = useState("");
  const [transcriptB, setTranscriptB] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function analyze() {
    if (busy !== "idle" || transcriptA.trim() === "" || transcriptB.trim() === "") return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy("analyzing");
    setError(null);
    try {
      const res = await postAnalyze({ transcriptA, transcriptB }, ctrl.signal);
      setResponse(res);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(`Analysis request failed. ${messageOf(e)}`);
    } finally {
      abortRef.current = null;
      setBusy("idle");
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function loadSample() {
    if (busy !== "idle") return;
    setBusy("loading-sample");
    setError(null);
    try {
      const s = await getSample();
      setTranscriptA(s.transcriptA);
      setTranscriptB(s.transcriptB);
    } catch (e) {
      setError(`Could not load the sample. ${messageOf(e)}`);
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Deposition Contradiction Detector</h1>
        <p className="lede">
          Compare two depositions of the same witness and see where the story changed. Facts are extracted by a language model;
          every verdict and score comes from fixed, deterministic rules.
        </p>
      </header>

      {response ? (
        <ResultView response={response} onBack={() => setResponse(null)} />
      ) : (
        <InputView
          transcriptA={transcriptA}
          transcriptB={transcriptB}
          onChangeA={setTranscriptA}
          onChangeB={setTranscriptB}
          onAnalyze={analyze}
          onLoadSample={loadSample}
          onCancel={cancel}
          analyzing={busy === "analyzing"}
          loadingSample={busy === "loading-sample"}
          error={error}
        />
      )}
    </div>
  );
}
