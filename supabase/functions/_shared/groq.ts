export type GroqResult =
  | { ok: true; text: string; promptTokens: number; outputTokens: number }
  | { ok: false; status: number | "timeout" | "network"; message: string; detail?: string };

export async function callGroqCompletion(args: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  json?: boolean;
  maxTokens: number;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<GroqResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3);
  const timeoutMs = args.timeoutMs ?? 60000;
  let lastStatus: number | "timeout" | "network" = "network";
  let lastDetail = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: args.model,
            messages: [
              { role: "system", content: args.systemInstruction },
              { role: "user", content: args.prompt },
            ],
            stream: false,
            max_completion_tokens: args.maxTokens,
            temperature: 0.2,
            ...(args.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        lastStatus = response.status;
        lastDetail = (await response.text()).slice(0, 1000);
        if ([400, 401, 403, 404, 422].includes(response.status)) break;
        if (response.status !== 429 && response.status < 500) break;
        if (attempt < maxAttempts - 1) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 10000)
            : Math.min((args.retryDelayMs ?? 800) * 2 ** attempt, 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        lastStatus = 502;
        lastDetail = "Groq returned an empty response.";
        break;
      }
      return {
        ok: true,
        text: text.trim(),
        promptTokens: Number(data?.usage?.prompt_tokens) || 0,
        outputTokens: Number(data?.usage?.completion_tokens) || 0,
      };
    } catch (error) {
      lastStatus = error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
      lastDetail = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.min((args.retryDelayMs ?? 800) * 2 ** attempt, 5000)));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = lastStatus === 429
    ? "Groq is receiving too many requests. Please wait and try again."
    : lastStatus === "timeout"
      ? "Groq took too long to respond. Please try again."
      : lastStatus === "network"
        ? "Could not reach Groq. Check the connection and try again."
        : lastStatus === 401 || lastStatus === 403
          ? "The Groq API key is invalid or does not have access."
          : "Groq could not generate this draft. Please try again.";
  return { ok: false, status: lastStatus, message, detail: lastDetail };
}
