import { NextResponse } from "next/server";
import { z } from "zod";
import { searchContent } from "@/lib/content";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import { config } from "@/lib/config";

export const runtime = "nodejs";
const paramsSchema = z.object({ q: z.string().min(2).max(300), limit: z.coerce.number().int().min(1).max(30).default(10) });

export async function GET(request: Request) {
  if (!allowRequest(`search:${clientAddress(request)}`, config().SEARCH_RATE_LIMIT_PER_MINUTE)) return NextResponse.json({ error: "Demasiadas búsquedas." }, { status: 429 });
  const url = new URL(request.url); const parsed = paramsSchema.safeParse({ q: url.searchParams.get("q"), limit: url.searchParams.get("limit") || 10 });
  if (!parsed.success) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  return NextResponse.json({ results: await searchContent(parsed.data.q, parsed.data.limit) });
}
