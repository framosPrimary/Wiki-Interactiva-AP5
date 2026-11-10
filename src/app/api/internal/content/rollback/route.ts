import { NextResponse } from "next/server";
import { z } from "zod";
import { validWebhookSignature } from "@/lib/webhook";
import { rollbackContent } from "@/lib/ingestion";

export const runtime = "nodejs";
const schema = z.object({ commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i) });
export async function POST(request: Request) {
  const raw = await request.text();
  if (!validWebhookSignature(raw, request.headers.get("x-ap5-signature") || request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Payload inválido." }, { status: 400 }); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  try { return NextResponse.json(await rollbackContent(parsed.data.commitSha)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falló el rollback." }, { status: 422 }); }
}
