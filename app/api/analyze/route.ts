import { llmClientFromEnv } from "@/server/llm/client";
import { handleAnalyze } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Two extraction calls plus a nomination call can take a while. */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  return handleAnalyze(request, () => llmClientFromEnv());
}
