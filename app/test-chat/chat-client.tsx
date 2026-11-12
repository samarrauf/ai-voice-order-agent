"use client";

import { useRef, useState } from "react";

type ToolCall = { name: string; input: unknown; status: number; result: unknown; ms: number };
type Bubble = { from: "you" | "gio" | "error"; text: string; toolCalls?: ToolCall[]; meta?: string };

export default function ChatClient() {
  // The full API-format history (including tool calls and thinking blocks).
  // Sent back to the server each turn — the server keeps no state.
  const history = useRef<unknown[]>([]);
  // Restaurant status block, fetched by the server on the first turn and kept for the call.
  const statusContext = useRef<string | undefined>(undefined);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [totalCost, setTotalCost] = useState(0);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setBubbles((b) => [...b, { from: "you", text }]);
    const messages = [...history.current, { role: "user", content: text }];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, statusContext: statusContext.current }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      history.current = json.messages;
      statusContext.current = json.statusContext;
      setTotalCost((c) => c + json.usage.costUsd);
      setBubbles((b) => [
        ...b,
        {
          from: "gio",
          text: json.reply || "(no reply)",
          toolCalls: json.toolCalls,
          meta: `${json.usage.ms}ms · in ${json.usage.input} / out ${json.usage.output} / cache read ${json.usage.cacheRead} tokens · $${json.usage.costUsd.toFixed(5)}`,
        },
      ]);
    } catch (e) {
      // Drop the failed user message from history so the next try starts clean.
      setBubbles((b) => [...b, { from: "error", text: String(e instanceof Error ? e.message : e) }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    history.current = [];
    statusContext.current = undefined;
    setBubbles([]);
    setTotalCost(0);
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Gio — text test</h1>
        <span style={{ fontSize: 12, color: "#666" }}>
          Conversation cost: ${totalCost.toFixed(4)}{" "}
          <button onClick={reset} style={{ marginLeft: 8, textDecoration: "underline" }}>New call</button>
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
        Type as the caller. Start with something like &quot;hello&quot;. Real orders are saved to the database.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 80 }}>
        {bubbles.map((b, i) => (
          <div key={i} style={{ alignSelf: b.from === "you" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div
              style={{
                background: b.from === "you" ? "#dcf8c6" : b.from === "error" ? "#fdd" : "#f1f1f1",
                padding: "8px 12px",
                borderRadius: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {b.text}
            </div>
            {b.toolCalls?.map((t, j) => (
              <details key={j} style={{ background: "#eee", color: "#555", fontSize: 11, marginTop: 4, padding: "4px 8px", borderRadius: 6 }}>
                <summary style={{ cursor: "pointer" }}>
                  🔧 {t.name} → {t.status} ({t.ms}ms) {(t.result as { speech?: string })?.speech ? `“${(t.result as { speech: string }).speech}”` : ""}
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {"input: " + JSON.stringify(t.input, null, 2) + "\n\nresult: " + JSON.stringify(t.result, null, 2)}
                </pre>
              </details>
            ))}
            {b.meta && <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{b.meta}</div>}
          </div>
        ))}
        {busy && <div style={{ color: "#999", fontSize: 12 }}>Gio is typing…</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ddd", padding: 12 }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 8 }}>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something as the caller…"
            style={{ flex: 1, border: "1px solid #ccc", borderRadius: 20, padding: "8px 14px" }}
          />
          <button type="submit" disabled={busy} style={{ padding: "8px 16px", borderRadius: 20, background: "#25d366", color: "white" }}>
            Send
          </button>
        </div>
      </form>
    </main>
  );
}
