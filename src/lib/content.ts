import { query } from "./db";
import type { NavItem, SearchHit, WikiDocument } from "./types";
import { embedTexts } from "./ai/providers";
import { config } from "./config";
import { localDocument, localNavigation, localRecent, localSearch, localStats } from "./local-content";

interface ActiveRow { id: string; commit_sha: string; published_at: Date; stats: Record<string, number> }

export async function activeVersion(): Promise<ActiveRow | null> {
  if (config().LOCAL_FILESYSTEM_MODE) return { id: "local", commit_sha: "local-preview", published_at: new Date(), stats: await localStats() };
  const result = await query<ActiveRow>(`SELECT v.id, v.commit_sha, v.published_at, v.stats
    FROM active_content_version a JOIN content_versions v ON v.id = a.version_id WHERE a.singleton = true`);
  return result.rows[0] ?? null;
}

export async function navigation(): Promise<NavItem[]> {
  if (config().LOCAL_FILESYSTEM_MODE) return localNavigation();
  const result = await query<{
    title: string; slug: string; document_id: string | null; module: string; submodule: string | null; source_path: string;
  }>(`SELECT d.title, d.slug, d.document_id, d.module, d.submodule, d.source_path
     FROM documents d JOIN active_content_version a ON a.version_id = d.version_id
     ORDER BY coalesce((d.metadata->>'moduleOrder')::int,999), d.module, coalesce(d.submodule,''), coalesce((d.metadata->>'pageOrder')::int,999), d.title`);
  return result.rows.map((row) => ({ ...row, documentId: row.document_id, submodule: row.submodule, isIndex: /(?:^|\/)README\.md$/i.test(row.source_path) }));
}

export async function documentBySlug(slug: string): Promise<WikiDocument | null> {
  if (config().LOCAL_FILESYSTEM_MODE) return localDocument(slug);
  const result = await query<{
    id: string; version_id: string; slug: string; source_path: string; title: string; module: string; submodule: string | null;
    document_id: string | null; revision: number | null; review_status: string | null; content: string; headings: WikiDocument["headings"];
  }>(`SELECT d.* FROM documents d JOIN active_content_version a ON a.version_id = d.version_id WHERE d.slug = $1`, [slug]);
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, versionId: row.version_id, slug: row.slug, sourcePath: row.source_path, title: row.title, module: row.module, submodule: row.submodule, documentId: row.document_id, revision: row.revision, reviewStatus: row.review_status, content: row.content, headings: row.headings };
}

export async function recentDocuments(limit = 8): Promise<NavItem[]> {
  if (config().LOCAL_FILESYSTEM_MODE) return localRecent(limit);
  const result = await query<{ title: string; slug: string; document_id: string | null; module: string; submodule: string | null }>(
    `SELECT d.title, d.slug, d.document_id, d.module, d.submodule FROM documents d
     JOIN active_content_version a ON a.version_id = d.version_id
     WHERE d.document_id IS NOT NULL ORDER BY coalesce(d.revision,0) DESC, d.title LIMIT $1`, [limit]);
  return result.rows.map((row) => ({ ...row, documentId: row.document_id, isIndex: false }));
}

function vectorLiteral(vector: number[]): string { return `[${vector.join(",")}]`; }

export async function contextForSlug(slug: string, limit = 5): Promise<SearchHit[]> {
  if (config().LOCAL_FILESYSTEM_MODE) {
    const document = await localDocument(slug);
    return document ? localSearch(`${document.title} ${document.documentId}`, limit) : [];
  }
  const result = await query<{
    title: string; slug: string; document_id: string | null; heading: string | null; anchor: string | null;
    excerpt: string; authority: "functional" | "supplemental"; source_kind: string; review_status: string | null;
    limitations: string | null; source_path: string;
  }>(`SELECT c.title, d.slug, d.document_id, c.heading, c.anchor, c.content excerpt,
      c.authority, c.source_kind, c.review_status, c.limitations, c.source_path
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN active_content_version a ON a.version_id = c.version_id
    WHERE d.slug = $1
    ORDER BY c.authority ASC, c.id
    LIMIT $2`, [slug, Math.min(Math.max(limit, 1), 10)]);
  return result.rows.map((row) => ({ ...row, documentId: row.document_id, sourceKind: row.source_kind, reviewStatus: row.review_status, sourcePath: row.source_path, score: 1 }));
}

export async function searchContent(term: string, limit = 10): Promise<SearchHit[]> {
  if (config().LOCAL_FILESYSTEM_MODE) return localSearch(term, limit);
  const clean = term.trim().slice(0, 300);
  if (!clean) return [];
  let embedding: number[] | null = null;
  try { [embedding] = await embedTexts([clean]); }
  catch { embedding = null; }
  const values: unknown[] = [clean, Math.min(Math.max(limit, 1), 30)];
  let semantic = "0";
  if (embedding) {
    values.push(vectorLiteral(embedding));
    semantic = "CASE WHEN c.embedding IS NULL THEN 0 ELSE greatest(0, 1 - (c.embedding <=> $3::vector)) END";
  }
  const result = await query<{
    title: string; slug: string | null; document_id: string | null; heading: string | null; anchor: string | null;
    excerpt: string; authority: "functional" | "supplemental"; source_kind: string; review_status: string | null;
    limitations: string | null; source_path: string; score: number;
  }>(`SELECT c.title, d.slug, d.document_id, c.heading, c.anchor,
      ts_headline('spanish', c.content, websearch_to_tsquery('spanish',$1), 'MaxWords=36, MinWords=12') excerpt,
      c.authority, c.source_kind, c.review_status, c.limitations, c.source_path,
      (ts_rank_cd(c.search_vector, websearch_to_tsquery('spanish',$1)) * 2 + ${semantic} + CASE WHEN c.authority='functional' THEN .25 ELSE 0 END)::float score
    FROM chunks c
    JOIN active_content_version a ON a.version_id = c.version_id
    LEFT JOIN documents d ON d.id = c.document_id
    WHERE c.search_vector @@ websearch_to_tsquery('spanish',$1) ${embedding ? "OR (c.embedding IS NOT NULL AND 1 - (c.embedding <=> $3::vector) > .55)" : ""}
    ORDER BY score DESC, c.authority ASC LIMIT $2`, values);
  return result.rows.map((row) => ({ ...row, documentId: row.document_id, sourceKind: row.source_kind, reviewStatus: row.review_status, sourcePath: row.source_path, score: Number(row.score) }));
}
