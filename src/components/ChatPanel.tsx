"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { Citation } from "@/lib/types";

interface Message { role: "user" | "assistant"; content: string; citations?: Citation[] }

function MessageContent({ message }: { message: Message }) {
  const citations = new Map((message.citations ?? []).map((citation) => [citation.index, citation]));
  const parts = message.content.split(/(\[\[\d+\]\])/g);
  return <>{parts.map((part, index) => {
    const match = part.match(/^\[\[(\d+)\]\]$/);
    if (!match) return <span key={index}>{part}</span>;
    const citation = citations.get(Number(match[1]));
    return citation?.href
      ? <Link className="inline-citation" href={citation.href} title={`${citation.title} — ${citation.heading ?? "General"}`} key={index}>{part}</Link>
      : <span className="inline-citation unavailable" key={index}>{part}</span>;
  })}</>;
}

export function ChatPanel({ contextPath }: { contextPath: string }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Podés consultarme sobre la pantalla abierta o sobre cualquier módulo de AP5. Mis respuestas incluyen las fuentes utilizadas." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const previous = messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-8);
    setInput(""); setBusy(true);
    setMessages((current) => [...current, { role: "user", content: question }, { role: "assistant", content: "" }]);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question, history: previous, contextSlug: contextPath.startsWith("/docs/") ? decodeURIComponent(contextPath.slice(6)) : null }), signal: abort.current.signal });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.split("\n").find((item) => item.startsWith("data:")); if (!line) continue;
          const data = JSON.parse(line.slice(5));
          if (data.type === "sources") setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, citations: data.sources } : m));
          if (data.type === "delta") setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: m.content + data.text } : m));
          if (data.type === "error") throw new Error(data.message);
        }
        if (done) break;
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: `No pude completar la consulta. ${(error as Error).message}` } : m));
    } finally { setBusy(false); abort.current = null; }
  }

  return <div className="chat-panel">
    <div className="chat-heading"><div className="agent-avatar">A5</div><div><strong>Agente documental</strong><span>Responde desde el corpus publicado</span></div></div>
    <div className="chat-messages" aria-live="polite">{messages.map((message, index) => <article className={`message ${message.role}`} key={index}>
      <div>{message.content ? <MessageContent message={message} /> : <span className="typing">Consultando fuentes…</span>}</div>
      {message.citations && message.citations.length > 0 && <details className="citations"><summary>{message.citations.length} fuentes consultadas</summary>{message.citations.map((citation) => citation.href ? <Link href={citation.href} key={citation.index}><b>[{citation.index}]</b> {citation.title}<small>{citation.authority === "supplemental" ? "Complemento · " : ""}{citation.heading}</small></Link> : <div key={citation.index}><b>[{citation.index}]</b> {citation.title}<small>Complemento interno · {citation.reviewStatus}</small></div>)}</details>}
    </article>)}</div>
    <form className="chat-form" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={3} placeholder="Escribí una consulta sobre AP5…" /><div><small>La respuesta puede incluir información pendiente de revisión, siempre rotulada.</small><button disabled={busy || !input.trim()}>{busy ? "…" : "Enviar"}</button></div></form>
  </div>;
}
