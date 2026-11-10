import { config } from "../config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type Provider = "none" | "openai" | "openai-compatible" | "gemini";

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

async function* parseSse(response: Response): AsyncGenerator<unknown> {
  if (!response.ok) throw new Error(`Proveedor IA respondió ${response.status}: ${await response.text()}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("El proveedor no devolvió un stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        yield JSON.parse(data);
      }
    }
    if (done) break;
  }
}

function openAiBase(provider: Provider, configured?: string): string {
  if (configured) return configured.replace(/\/$/, "");
  if (provider === "openai") return "https://api.openai.com/v1";
  throw new Error("AI_BASE_URL es obligatorio para openai-compatible.");
}

export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const cfg = config();
  if (cfg.AI_PROVIDER === "none") throw new Error("El agente no tiene un proveedor de IA configurado.");
  const key = requireValue(cfg.AI_API_KEY, "AI_API_KEY");
  const model = requireValue(cfg.AI_CHAT_MODEL, "AI_CHAT_MODEL");

  if (cfg.AI_PROVIDER === "openai" || cfg.AI_PROVIDER === "openai-compatible") {
    const response = await fetch(`${openAiBase(cfg.AI_PROVIDER, cfg.AI_BASE_URL)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.1 }),
    });
    for await (const event of parseSse(response)) {
      const delta = (event as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const base = (cfg.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.1 } }),
  });
  for await (const event of parseSse(response)) {
    const text = (event as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (text) yield text;
  }
}

export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const cfg = config();
  if (cfg.EMBEDDING_PROVIDER === "none") return texts.map(() => null);
  const key = requireValue(cfg.EMBEDDING_API_KEY || cfg.AI_API_KEY, "EMBEDDING_API_KEY");
  const model = requireValue(cfg.EMBEDDING_MODEL, "EMBEDDING_MODEL");

  if (cfg.EMBEDDING_PROVIDER === "openai" || cfg.EMBEDDING_PROVIDER === "openai-compatible") {
    const base = openAiBase(cfg.EMBEDDING_PROVIDER, cfg.EMBEDDING_BASE_URL || cfg.AI_BASE_URL);
    const response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: texts, dimensions: cfg.EMBEDDING_DIMENSIONS }),
    });
    if (!response.ok) throw new Error(`Embedding respondió ${response.status}: ${await response.text()}`);
    const payload = await response.json() as { data: { index: number; embedding: number[] }[] };
    return payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  const base = (cfg.EMBEDDING_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  return Promise.all(texts.map(async (text) => {
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: cfg.EMBEDDING_DIMENSIONS }),
    });
    if (!response.ok) throw new Error(`Gemini embedding respondió ${response.status}: ${await response.text()}`);
    const payload = await response.json() as { embedding: { values: number[] } };
    return payload.embedding.values;
  }));
}
