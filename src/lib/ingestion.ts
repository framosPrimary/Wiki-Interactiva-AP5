import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fg from "fast-glob";
import type { PoolClient } from "pg";
import { config } from "./config";
import { database, transaction } from "./db";
import { chunkMarkdown, extractHeadings, extractTitle, markdownToText } from "./markdown";
import { sourcePathToSlug } from "./slug";
import { embedTexts } from "./ai/providers";

interface Artifact {
  id: string; path: string; revision: number; status: string; use_for_support_answers?: boolean;
}

interface PreparedDocument {
  sourcePath: string; slug: string; title: string; module: string; submodule: string | null; documentId: string | null;
  revision: number | null; reviewStatus: string | null; content: string; headings: ReturnType<typeof extractHeadings>; metadata: Record<string, unknown>;
}

interface PreparedChunk {
  documentKey: string | null; sourcePath: string; title: string; heading: string | null; anchor: string | null; content: string;
  authority: "functional" | "supplemental"; sourceKind: string; reviewStatus: string | null; limitations: string | null; metadata: Record<string, unknown>;
}

export interface IngestionResult { versionId: string; commitSha: string; documents: number; chunks: number; assets: number; idempotent: boolean }
export interface CorpusValidation { documents: number; functionalChunks: number; supplementalChunks: number; assets: number }

export async function rollbackContent(commitSha: string): Promise<{ versionId: string; commitSha: string }> {
  return transaction(async (client) => {
    const target = await client.query<{ id: string }>("SELECT id FROM content_versions WHERE commit_sha=$1 AND status IN ('published','superseded')", [commitSha]);
    if (!target.rows[0]) throw new Error("La versión solicitada no está disponible para rollback.");
    await client.query("UPDATE content_versions SET status='superseded' WHERE status='published'");
    await client.query("UPDATE content_versions SET status='published',published_at=now() WHERE id=$1", [target.rows[0].id]);
    await client.query("UPDATE active_content_version SET version_id=$1 WHERE singleton=true", [target.rows[0].id]);
    await client.query("INSERT INTO sync_events(commit_sha,outcome,detail) VALUES($1,'rollback','{}'::jsonb)", [commitSha]);
    return { versionId: target.rows[0].id, commitSha };
  });
}

function posix(value: string): string { return value.replaceAll("\\", "/"); }
function readJson<T>(file: string): Promise<T> { return fs.readFile(file, "utf8").then(JSON.parse) as Promise<T>; }

export function assertNoSensitiveContent(sourcePath: string, value: string): void {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) throw new Error(`Material sensible detectado en ${sourcePath}.`);
  const assignments = value.matchAll(/(?:password|contraseña|pwd|api[_-]?key|secret|access[_-]?token)\s*(?:=|:)\s*["']?([^\s;"']{6,})/gi);
  for (const match of assignments) {
    const candidate = match[1].toLowerCase();
    if (/^(?:\$|\{|<|\*|x{4}|change-|example|redact)/.test(candidate)) continue;
    throw new Error(`Posible credencial detectada en ${sourcePath}.`);
  }
}

function resolveCommit(sourceRoot: string, requested?: string): string {
  const actual = config().CONTENT_COMMIT_SHA || execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (requested && requested !== actual) throw new Error(`El commit solicitado ${requested} no coincide con la fuente montada ${actual}.`);
  if (!/^[a-f0-9]{7,64}$/i.test(actual)) throw new Error("Commit de contenido inválido.");
  return actual;
}

async function validateMarkdownLinks(sourceRoot: string, file: string, content: string): Promise<void> {
  const matches = [...content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g)];
  for (const match of matches) {
    const raw = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!raw || /^(?:https?:|mailto:|data:)/i.test(raw)) continue;
    const decoded = decodeURIComponent(raw);
    const target = path.resolve(path.dirname(file), decoded);
    if (!target.startsWith(sourceRoot + path.sep) && target !== sourceRoot) throw new Error(`Enlace fuera del arnés permitido: ${posix(path.relative(sourceRoot, file))} -> ${raw}`);
    if (!fsSync.existsSync(target)) throw new Error(`Enlace inexistente: ${posix(path.relative(sourceRoot, file))} -> ${raw}`);
  }
}

async function prepare(sourceRoot: string): Promise<{ documents: PreparedDocument[]; chunks: PreparedChunk[]; assetFiles: string[] }> {
  const artifactsData = await readJson<{ artifacts: Artifact[] }>(path.join(sourceRoot, "registry", "artifacts.json"));
  const artifactByPath = new Map(artifactsData.artifacts.map((item) => [posix(item.path), item]));
  const screenCatalog = await readJson<{ screens: Record<string, unknown>[] }>(path.join(sourceRoot, "registry", "screen-catalog.json"));
  const coverage = await readJson<{ units: Record<string, unknown>[] }>(path.join(sourceRoot, "registry", "coverage.json"));
  const support = await readJson<{ items: Record<string, unknown>[] }>(path.join(sourceRoot, "Support", "knowledge-index.json"));

  const markdownFiles = await fg("Documentation/**/*.md", { cwd: sourceRoot, absolute: true, onlyFiles: true });
  const markdownByPath = new Map<string, string>();
  const directoryLabels = new Map<string, string>();
  const moduleOrder = new Map<string, number>();
  const pageOrder = new Map<string, number>();
  for (const file of markdownFiles.sort()) {
    const sourcePath = posix(path.relative(sourceRoot, file));
    const content = await fs.readFile(file, "utf8");
    assertNoSensitiveContent(sourcePath, content);
    await validateMarkdownLinks(sourceRoot, file, content);
    markdownByPath.set(sourcePath, content);
    if (!/\bREADME\.md$/i.test(sourcePath)) continue;
    directoryLabels.set(posix(path.dirname(sourcePath)), extractTitle(content, path.basename(path.dirname(sourcePath))));
    const links = [...content.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g)];
    let order = 0;
    for (const link of links) {
      const raw = link[1].replace(/^<|>$/g, "").split("#")[0];
      if (!/\.md$/i.test(raw)) continue;
      const target = posix(path.relative(sourceRoot, path.resolve(path.dirname(file), decodeURIComponent(raw))));
      if (!pageOrder.has(target)) pageOrder.set(target, order++);
      if (sourcePath === "Documentation/README.md" && /\/README\.md$/i.test(target)) {
        const moduleName = target.split("/")[1];
        if (moduleName && !moduleOrder.has(moduleName)) moduleOrder.set(moduleName, moduleOrder.size);
      }
    }
  }
  const documents: PreparedDocument[] = [];
  const chunks: PreparedChunk[] = [];
  for (const file of markdownFiles.sort()) {
    const sourcePath = posix(path.relative(sourceRoot, file));
    const content = markdownByPath.get(sourcePath)!;
    const parts = sourcePath.split("/");
    const artifact = artifactByPath.get(sourcePath);
    if (!artifact?.id?.startsWith("DOC-")) continue;
    const rawModule = parts[1] || "General";
    const moduleName = directoryLabels.get(`Documentation/${rawModule}`) ?? rawModule;
    const submoduleParts = parts.slice(2, -1);
    const submodule = submoduleParts.length ? submoduleParts.map((_, index) => {
      const directory = ["Documentation", rawModule, ...submoduleParts.slice(0, index + 1)].join("/");
      return directoryLabels.get(directory) ?? submoduleParts[index];
    }).join(" → ") : null;
    const documentId = artifact.id;
    const title = extractTitle(content, path.basename(file, ".md"));
    const metadata = { useForSupportAnswers: artifact.use_for_support_answers ?? false, moduleOrder: moduleOrder.get(rawModule) ?? 999, pageOrder: pageOrder.get(sourcePath) ?? 999 };
    documents.push({ sourcePath, slug: sourcePathToSlug(sourcePath), title, module: moduleName, submodule, documentId, revision: artifact?.revision ?? null, reviewStatus: artifact?.status ?? null, content, headings: extractHeadings(content), metadata });
    for (const chunk of chunkMarkdown(content)) chunks.push({ documentKey: sourcePath, sourcePath, title, ...chunk, authority: "functional", sourceKind: "documentation", reviewStatus: artifact?.status ?? null, limitations: null, metadata: { documentId, module: moduleName, submodule } });
  }

  const docById = new Map(documents.filter((d) => d.documentId).map((d) => [d.documentId!, d]));
  for (const raw of screenCatalog.screens) {
    const screen = raw as { id?: string; title?: string; document_id?: string; documentation_selected?: boolean; module?: string; type_label?: string; prod_roles?: string[]; prod_urls?: string[]; policy_resolution?: string; audit_state?: string };
    if (!screen.documentation_selected || !screen.document_id || !docById.has(screen.document_id)) continue;
    const doc = docById.get(screen.document_id)!;
    const content = [
      `Pantalla: ${screen.title}.`, `Módulo: ${screen.module}.`, `Tipo: ${screen.type_label}.`,
      `Roles de Producción: ${(screen.prod_roles ?? []).join(", ") || "sin roles informados"}.`,
      `URLs: ${(screen.prod_urls ?? []).join(", ") || "sin URL informada"}.`,
      screen.policy_resolution ? `Resolución de alcance: ${screen.policy_resolution}` : "",
    ].filter(Boolean).join("\n");
    chunks.push({ documentKey: doc.sourcePath, sourcePath: `registry/screen-catalog.json#${screen.id}`, title: `${screen.title} — catálogo`, heading: "Catálogo y roles", anchor: null, content, authority: "supplemental", sourceKind: "harness_catalog", reviewStatus: screen.audit_state ?? null, limitations: "Los roles proceden de la exportación de Producción aportada; no equivalen a pruebas de permisos por acción.", metadata: { screenId: screen.id, documentId: screen.document_id } });
  }

  for (const raw of coverage.units) {
    const unit = raw as { id?: string; scope?: string; dimensions?: Record<string, { status?: string; note?: string }> };
    if (!unit.id || !docById.has(unit.id)) continue;
    const doc = docById.get(unit.id)!;
    const dimensionText = Object.entries(unit.dimensions ?? {}).map(([name, value]) => `${name}: ${value.status ?? "sin estado"}. ${value.note ?? ""}`).join("\n");
    chunks.push({ documentKey: doc.sourcePath, sourcePath: `registry/coverage.json#${unit.id}`, title: `${doc.title} — cobertura`, heading: "Cobertura documental", anchor: null, content: `${unit.scope ?? ""}\n${dimensionText}`, authority: "supplemental", sourceKind: "harness_coverage", reviewStatus: "en_revision", limitations: "La cobertura registra alcance y pendientes; no sustituye la documentación funcional.", metadata: { documentId: unit.id } });
  }

  for (const raw of support.items) {
    const item = raw as { id?: string; topic?: string; related_document?: string; finding?: string; status?: string; limitations?: string; source_case?: string };
    if (!item.id || !item.topic || !item.finding) continue;
    assertNoSensitiveContent(`Support/knowledge-index.json#${item.id}`, item.finding);
    const doc = item.related_document ? docById.get(item.related_document) : undefined;
    chunks.push({ documentKey: doc?.sourcePath ?? null, sourcePath: `Support/knowledge-index.json#${item.id}`, title: item.topic, heading: "Hallazgo de soporte", anchor: null, content: item.finding, authority: "supplemental", sourceKind: "support_knowledge", reviewStatus: item.status ?? "pendiente_revision", limitations: item.limitations ?? "Hallazgo de soporte pendiente de promoción documental.", metadata: { supportId: item.id, sourceCase: item.source_case, relatedDocument: item.related_document } });
  }

  const assetFiles = await fg("Documentation/**/*.{png,jpg,jpeg,webp,gif,svg,pdf}", { cwd: sourceRoot, absolute: true, onlyFiles: true, caseSensitiveMatch: false });
  return { documents, chunks, assetFiles };
}

export async function validateArchitecture(sourceRoot = config().ARCHITECTURE_SOURCE_PATH): Promise<CorpusValidation> {
  const prepared = await prepare(path.resolve(sourceRoot));
  return {
    documents: prepared.documents.length,
    functionalChunks: prepared.chunks.filter((chunk) => chunk.authority === "functional").length,
    supplementalChunks: prepared.chunks.filter((chunk) => chunk.authority === "supplemental").length,
    assets: prepared.assetFiles.length,
  };
}

async function insertChunks(client: PoolClient, versionId: string, chunks: PreparedChunk[], documentIds: Map<string, string>): Promise<void> {
  const batchSize = 16;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const embeddings = await embedTexts(batch.map((chunk) => markdownToText(chunk.content).slice(0, 7000)));
    for (let index = 0; index < batch.length; index++) {
      const chunk = batch[index];
      const embedding = embeddings[index] ? `[${embeddings[index]!.join(",")}]` : null;
      await client.query(`INSERT INTO chunks(version_id,document_id,source_path,title,heading,anchor,content,authority,source_kind,review_status,limitations,metadata,embedding)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector)`, [versionId, chunk.documentKey ? documentIds.get(chunk.documentKey) ?? null : null, chunk.sourcePath, chunk.title, chunk.heading, chunk.anchor, chunk.content, chunk.authority, chunk.sourceKind, chunk.reviewStatus, chunk.limitations, chunk.metadata, embedding]);
    }
  }
}

export async function ingestArchitecture(options: { sourceRoot?: string; requestedCommit?: string } = {}): Promise<IngestionResult> {
  const sourceRoot = path.resolve(/* turbopackIgnore: true */ options.sourceRoot || config().ARCHITECTURE_SOURCE_PATH);
  const commitSha = resolveCommit(sourceRoot, options.requestedCommit);
  const existing = await database().query<{ id: string; status: string; stats: { documents?: number; chunks?: number; assets?: number } }>("SELECT id,status,stats FROM content_versions WHERE commit_sha=$1", [commitSha]);
  if (existing.rows[0]?.status === "published") return { versionId: existing.rows[0].id, commitSha, documents: existing.rows[0].stats.documents ?? 0, chunks: existing.rows[0].stats.chunks ?? 0, assets: existing.rows[0].stats.assets ?? 0, idempotent: true };

  const prepared = await prepare(sourceRoot);
  const assetRoot = path.resolve(config().CONTENT_ASSET_PATH, commitSha);
  await fs.rm(assetRoot, { recursive: true, force: true });
  await fs.mkdir(assetRoot, { recursive: true });
  for (const file of prepared.assetFiles) {
    const relative = path.relative(sourceRoot, file);
    const destination = path.join(assetRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
  }

  let versionId = "";
  try {
    versionId = await transaction(async (client) => {
      if (existing.rows[0]) await client.query("DELETE FROM content_versions WHERE id=$1", [existing.rows[0].id]);
      const version = await client.query<{ id: string }>("INSERT INTO content_versions(commit_sha,status,source_path) VALUES($1,'staging',$2) RETURNING id", [commitSha, sourceRoot]);
      const id = version.rows[0].id;
      const documentIds = new Map<string, string>();
      for (const doc of prepared.documents) {
        const inserted = await client.query<{ id: string }>(`INSERT INTO documents(version_id,slug,source_path,title,module,submodule,document_id,revision,review_status,content,headings,metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [id, doc.slug, doc.sourcePath, doc.title, doc.module, doc.submodule, doc.documentId, doc.revision, doc.reviewStatus, doc.content, JSON.stringify(doc.headings), doc.metadata]);
        documentIds.set(doc.sourcePath, inserted.rows[0].id);
      }
      await insertChunks(client, id, prepared.chunks, documentIds);
      const stats = { documents: prepared.documents.length, chunks: prepared.chunks.length, assets: prepared.assetFiles.length };
      await client.query("UPDATE content_versions SET status='superseded' WHERE status='published'");
      await client.query("UPDATE content_versions SET status='published',stats=$2,published_at=now() WHERE id=$1", [id, stats]);
      await client.query(`INSERT INTO active_content_version(singleton,version_id) VALUES(true,$1)
        ON CONFLICT(singleton) DO UPDATE SET version_id=excluded.version_id`, [id]);
      await client.query("INSERT INTO sync_events(commit_sha,outcome,detail) VALUES($1,'published',$2)", [commitSha, stats]);
      return id;
    });
  } catch (error) {
    await fs.rm(assetRoot, { recursive: true, force: true });
    await database().query("INSERT INTO sync_events(commit_sha,outcome,detail) VALUES($1,'failed',$2)", [commitSha, { error: error instanceof Error ? error.message : String(error) }]);
    throw error;
  }
  return { versionId, commitSha, documents: prepared.documents.length, chunks: prepared.chunks.length, assets: prepared.assetFiles.length, idempotent: false };
}
