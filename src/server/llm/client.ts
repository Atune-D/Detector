/**
 * The LLM boundary. The pipeline talks to `LlmClient` only, so tests use a fake
 * and replay mode uses saved responses; neither ever touches the network.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { UpstreamFailure } from "@/engine";

export type LlmPurpose = "extract_A" | "extract_B" | "nominate";

export interface LlmRequest {
  purpose: LlmPurpose;
  system: string;
  user: string;
  /** JSON Schema for the structured output. */
  schema: { [key: string]: unknown };
}

export interface LlmRawResponse {
  /** API stop reason ("end_turn", "max_tokens", "refusal", ...), null if absent. */
  stopReason: string | null;
  /** Concatenated text output, null if the response had no text block. */
  text: string | null;
}

/** A transport-level failure, already mapped to a run-level failure reason. */
export class LlmTransportError extends Error {
  constructor(
    readonly failure: Extract<UpstreamFailure, "upstream_timeout" | "upstream_missing">,
    message: string,
  ) {
    super(message);
    this.name = "LlmTransportError";
  }
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmRawResponse>;
}

export const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TOKENS = 64_000;

/** Map an SDK error to a transport error. Never includes request headers (the key). */
export function mapSdkError(err: unknown): LlmTransportError {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmTransportError("upstream_timeout", "The model API did not respond in time.");
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return new LlmTransportError("upstream_timeout", "The model request was aborted.");
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmTransportError("upstream_missing", "The model API rejected the credentials (check ANTHROPIC_API_KEY).");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmTransportError("upstream_missing", "The model API is rate-limiting requests; try again shortly.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmTransportError("upstream_missing", "Could not reach the model API.");
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmTransportError("upstream_missing", `The model API returned an error (status ${String(err.status ?? "unknown")}).`);
  }
  return new LlmTransportError("upstream_missing", "The model call failed unexpectedly.");
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async complete(req: LlmRequest): Promise<LlmRawResponse> {
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: { type: "json_schema", schema: req.schema } },
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
      const message = await stream.finalMessage();
      const texts: string[] = [];
      for (const block of message.content) {
        if (block.type === "text") texts.push(block.text);
      }
      return { stopReason: message.stop_reason ?? null, text: texts.length > 0 ? texts.join("") : null };
    } catch (err) {
      throw mapSdkError(err);
    }
  }
}

/** Build the live client from the environment, or null when no key is set. */
export function llmClientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const timeout = Number(env.LLM_TIMEOUT_MS);
  return new AnthropicLlmClient(key, model, Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS);
}
