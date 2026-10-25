export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_ITEMS = 20;

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

// Chat history is untrusted client input. It is trimmed, length-capped, and
// normalized so the model always receives a valid alternating conversation.
export function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned: ChatMessage[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (role !== "user" && role !== "assistant") {
      continue;
    }

    if (typeof content !== "string") {
      continue;
    }

    const trimmed = content.trim();

    if (!trimmed) {
      continue;
    }

    cleaned.push({
      role,
      content: trimmed.slice(0, MAX_MESSAGE_CHARS),
    });
  }

  const recent = cleaned.slice(-MAX_HISTORY_ITEMS);

  while (recent.length > 0 && recent[0].role !== "user") {
    recent.shift();
  }

  const normalized: ChatMessage[] = [];

  for (const message of recent) {
    const previous = normalized[normalized.length - 1];

    if (previous && previous.role === message.role) {
      previous.content += "\n\n" + message.content;
      previous.content = previous.content.slice(0, MAX_MESSAGE_CHARS);
    } else {
      normalized.push({ ...message });
    }
  }

  // The new question is appended by the caller, so history must end with an
  // assistant turn to keep the model conversation alternating.
  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1].role === "user"
  ) {
    normalized.pop();
  }

  return normalized;
}
