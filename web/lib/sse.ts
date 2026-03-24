/**
 * Parse POST /advise/stream — Server-Sent Events (data: {...}\\n\\n).
 */

export type StreamMetadata = {
  severity: string;
  severity_label: string;
  immediate_step: string;
  recheck_minutes: number;
  backup_step: string;
  escalation: string;
  late_hypo_warning: string | null;
  treatment_options: { action: string; detail: string; priority: number }[];
  timeline: { time_min: number; event: string; glucose: number }[];
  ispad_note: string;
  disclaimer: string;
};

export type StreamEvent =
  | { type: "metadata"; data: StreamMetadata }
  | { type: "conclusion"; text: string }
  | { type: "done" };

function baseUrl(): string {
  const u = process.env.NEXT_PUBLIC_STEADY_API_URL;
  if (!u || !u.trim()) return "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

export async function streamAdvise(
  body: Record<string, unknown>,
  onEvent: (ev: StreamEvent) => void
): Promise<void> {
  const res = await fetch(`${baseUrl()}/advise/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const block of parts) {
      const lines = block.split("\n").filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        try {
          const parsed = JSON.parse(raw) as StreamEvent;
          onEvent(parsed);
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}
