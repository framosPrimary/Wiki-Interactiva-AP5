import { NextResponse } from "next/server";
import { activeVersion } from "@/lib/content";
import { config } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET() { try { const version = await activeVersion(); return NextResponse.json({ status: "ok", database: "ok", corpus: version ? "published" : "empty", commit: version?.commit_sha ?? null, ai: config().AI_PROVIDER }); } catch { return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503 }); } }
