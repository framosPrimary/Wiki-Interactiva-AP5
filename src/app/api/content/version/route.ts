import { NextResponse } from "next/server";
import { activeVersion } from "@/lib/content";
export const dynamic = "force-dynamic";
export async function GET() { const version = await activeVersion(); return version ? NextResponse.json(version) : NextResponse.json({ error: "Sin corpus publicado." }, { status: 404 }); }
