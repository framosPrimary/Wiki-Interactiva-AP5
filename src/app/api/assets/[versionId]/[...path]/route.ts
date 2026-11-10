import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { query } from "@/lib/db";

export const runtime = "nodejs";
const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf" };
export async function GET(_: Request, { params }: { params: Promise<{ versionId: string; path: string[] }> }) {
  const values = await params; const relative = values.path.map(decodeURIComponent).join("/");
  if (!relative.startsWith("Documentation/") || relative.includes("..") || !mime[path.extname(relative).toLowerCase()]) return new NextResponse("Recurso inválido.", { status: 400 });
  const result = await query<{ commit_sha: string }>("SELECT commit_sha FROM content_versions WHERE id=$1", [values.versionId]);
  if (!result.rows[0]) return new NextResponse("Versión inexistente.", { status: 404 });
  const root = path.resolve(config().CONTENT_ASSET_PATH, result.rows[0].commit_sha); const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return new NextResponse("Recurso inválido.", { status: 400 });
  try { const body = await fs.readFile(file); return new NextResponse(body, { headers: { "content-type": mime[path.extname(file).toLowerCase()], "cache-control": "public, max-age=31536000, immutable" } }); }
  catch { return new NextResponse("Recurso inexistente.", { status: 404 }); }
}
