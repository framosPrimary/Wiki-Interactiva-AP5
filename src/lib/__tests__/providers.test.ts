import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "../config";
import { streamChat } from "../ai/providers";

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let value = "";
  for await (const fragment of stream) value += fragment;
  return value;
}

function sse(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_CHAT_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  resetConfigForTests();
});

describe.each([
  ["openai", undefined, "https://api.openai.com/v1/chat/completions"],
  ["openai-compatible", "https://modelo.interno/v1", "https://modelo.interno/v1/chat/completions"],
] as const)("contrato %s", (provider, baseUrl, expectedUrl) => {
  it("envía mensajes y consume el stream compatible", async () => {
    process.env.AI_PROVIDER = provider;
    process.env.AI_CHAT_MODEL = "modelo-chat";
    process.env.AI_API_KEY = "clave-prueba";
    if (baseUrl) process.env.AI_BASE_URL = baseUrl;
    resetConfigForTests();
    const fetchMock = vi.fn(async () => sse({ choices: [{ delta: { content: "Respuesta [[1]]" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect(streamChat([{ role: "user", content: "consulta" }]))).resolves.toBe("Respuesta [[1]]");
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ method: "POST" }));
  });
});

describe("contrato gemini", () => {
  it("traduce roles y consume el stream de Gemini", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_CHAT_MODEL = "gemini-prueba";
    process.env.AI_API_KEY = "clave-prueba";
    process.env.AI_BASE_URL = "https://gemini.interno/v1beta";
    resetConfigForTests();
    const fetchMock = vi.fn(async () => sse({ candidates: [{ content: { parts: [{ text: "Respuesta [[1]]" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect(streamChat([{ role: "system", content: "reglas" }, { role: "user", content: "consulta" }]))).resolves.toBe("Respuesta [[1]]");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gemini.interno/v1beta/models/gemini-prueba:streamGenerateContent?alt=sse&key=clave-prueba",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
