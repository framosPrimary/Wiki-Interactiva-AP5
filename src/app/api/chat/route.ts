import { z } from "zod";
import { config } from "@/lib/config";
import { contextForSlug, searchContent } from "@/lib/content";
import { streamChat, type ChatMessage } from "@/lib/ai/providers";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";
const schema = z.object({ message: z.string().min(2).max(2000), contextSlug: z.string().max(500).nullable().optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(8).default([]) });
const encoder = new TextEncoder();
const event = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  if (!allowRequest(`chat:${clientAddress(request)}`, config().CHAT_RATE_LIMIT_PER_MINUTE)) return new Response("Demasiadas consultas.", { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Consulta inválida.", { status: 400 });
  const contextSlug = parsed.data.contextSlug?.replace(/^\/?docs\//, "").replace(/^\//, "") || null;
  const [searched, pageContext] = await Promise.all([
    searchContent(parsed.data.message, 10),
    contextSlug ? contextForSlug(contextSlug, 5) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const hits = [...pageContext, ...searched].filter((hit) => {
    const key = `${hit.sourcePath}#${hit.anchor ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
  const citations: Citation[] = hits.map((hit, index) => ({ ...hit, index: index + 1, href: hit.slug ? `/docs/${hit.slug}${hit.anchor ? `#${hit.anchor}` : ""}` : null }));
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(event({ type: "sources", sources: citations }));
      if (!hits.length) {
        controller.enqueue(event({ type: "delta", text: "No encontré evidencia suficiente en el corpus publicado para confirmar esa consulta." })); controller.close(); return;
      }
      if (config().AI_PROVIDER === "none") {
        controller.enqueue(event({ type: "delta", text: "Encontré fuentes relacionadas, pero el proveedor de IA todavía no está configurado. Podés abrirlas desde la lista de fuentes." })); controller.close(); return;
      }
      const context = hits.map((hit, index) => `[[${index + 1}]] ${hit.authority === "functional" ? "DOCUMENTACIÓN FUNCIONAL" : "COMPLEMENTO ROTULADO"}\nTítulo: ${hit.title}\nSección: ${hit.heading ?? "General"}\nEstado: ${hit.reviewStatus ?? "sin estado"}\nLimitaciones: ${hit.limitations ?? "ninguna informada"}\nContenido:\n${hit.excerpt.replace(/<[^>]+>/g, "")}`).join("\n\n---\n\n");
      const system = `Sos el agente documental interno de AP5. Respondé en español claro. Usá primero DOCUMENTACIÓN FUNCIONAL. Los complementos deben presentarse explícitamente como información interna o pendiente y conservar sus limitaciones. Toda afirmación sobre AP5 debe incluir una cita [[n]] del contexto. No inventes, no sugieras haber consultado bases o sistemas vivos y decí que no puede confirmarse cuando falte evidencia. Contexto de página: ${contextSlug || "consulta general"}.\n\nFUENTES:\n${context}`;
      const messages: ChatMessage[] = [{ role: "system", content: system }, ...parsed.data.history, { role: "user", content: parsed.data.message }];
      let complete = "";
      try {
        for await (const delta of streamChat(messages)) { complete += delta; controller.enqueue(event({ type: "delta", text: delta })); }
        if (!/\[\[\d+\]\]/.test(complete)) controller.enqueue(event({ type: "delta", text: "\n\nFuente principal: [[1]]" }));
        controller.enqueue(event({ type: "done" })); controller.close();
      } catch (error) { controller.enqueue(event({ type: "error", message: error instanceof Error ? error.message : "Error del proveedor de IA." })); controller.close(); }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
