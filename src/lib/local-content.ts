import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { config } from "./config";
import { chunkMarkdown, extractHeadings, extractTitle, markdownToText } from "./markdown";
import { sourcePathToSlug } from "./slug";
import type { NavItem, SearchHit, WikiDocument } from "./types";

interface Artifact { id: string; path: string; revision?: number; status?: string }
interface LocalCorpus { documents: WikiDocument[]; navigation: NavItem[] }

let cached: Promise<LocalCorpus> | undefined;
const posix = (value: string) => value.replaceAll("\\", "/");

async function load(): Promise<LocalCorpus> {
  const root = path.resolve(config().ARCHITECTURE_SOURCE_PATH);
  const registry = JSON.parse(await fs.readFile(path.join(root, "registry", "artifacts.json"), "utf8")) as { artifacts: Artifact[] };
  const artifacts = new Map(registry.artifacts.map((artifact) => [posix(artifact.path), artifact]));
  const files = await fg("Documentation/**/*.md", { cwd: root, absolute: true, onlyFiles: true });
  const labels = new Map<string, string>();
  const moduleOrder = new Map<string, number>();
  const rootReadme = path.join(root, "Documentation", "README.md");
  for (const file of files.filter((file) => /README\.md$/i.test(file))) {
    const relative = posix(path.relative(root, file));
    const content = await fs.readFile(file, "utf8");
    labels.set(posix(path.dirname(relative)), extractTitle(content, path.basename(path.dirname(relative))));
    if (path.resolve(file) === path.resolve(rootReadme)) {
      for (const match of content.matchAll(/\[[^\]]+\]\((?:<)?([^)>]+\/README\.md)(?:>)?\)/gi)) {
        const moduleName = decodeURIComponent(match[1]).split("/")[0];
        if (!moduleOrder.has(moduleName)) moduleOrder.set(moduleName, moduleOrder.size);
      }
    }
  }

  const documents: (WikiDocument & { order: number })[] = [];
  for (const file of files) {
    const sourcePath = posix(path.relative(root, file));
    const artifact = artifacts.get(sourcePath);
    if (!artifact?.id.startsWith("DOC-")) continue;
    const content = await fs.readFile(file, "utf8");
    const parts = sourcePath.split("/");
    const rawModule = parts[1] || "General";
    const moduleName = labels.get(`Documentation/${rawModule}`) ?? rawModule;
    const subParts = parts.slice(2, -1);
    const submodule = subParts.length ? subParts.map((part, index) => labels.get(["Documentation", rawModule, ...subParts.slice(0, index + 1)].join("/")) ?? part).join(" → ") : null;
    documents.push({
      id: artifact.id,
      versionId: "local",
      slug: sourcePathToSlug(sourcePath),
      sourcePath,
      title: extractTitle(content, path.basename(file, ".md")),
      module: moduleName,
      submodule,
      documentId: artifact.id,
      revision: artifact.revision ?? null,
      reviewStatus: artifact.status ?? null,
      content,
      headings: extractHeadings(content),
      order: moduleOrder.get(rawModule) ?? 999,
    });
  }
  documents.sort((a, b) => a.order - b.order || a.module.localeCompare(b.module, "es") || (a.submodule ?? "").localeCompare(b.submodule ?? "", "es") || a.title.localeCompare(b.title, "es"));
  return { documents, navigation: documents.map((document) => ({ title: document.title, slug: document.slug, documentId: document.documentId, module: document.module, submodule: document.submodule, isIndex: false })) };
}

function corpus(): Promise<LocalCorpus> { return cached ??= load(); }

export async function localNavigation(): Promise<NavItem[]> { return (await corpus()).navigation; }
export async function localDocument(slug: string): Promise<WikiDocument | null> { return (await corpus()).documents.find((document) => document.slug === slug) ?? null; }
export async function localRecent(limit = 8): Promise<NavItem[]> { return (await corpus()).navigation.slice(0, limit); }
export async function localStats() { const value = await corpus(); return { documents: value.documents.length }; }

export async function localSearch(term: string, limit = 10): Promise<SearchHit[]> {
  const words = markdownToText(term).toLocaleLowerCase("es").split(/\s+/).filter((word) => word.length > 1);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const document of (await corpus()).documents) {
    for (const chunk of chunkMarkdown(document.content)) {
      const haystack = `${document.title} ${document.module} ${document.documentId} ${chunk.heading ?? ""} ${markdownToText(chunk.content)}`.toLocaleLowerCase("es");
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
      if (!score) continue;
      hits.push({ title: document.title, slug: document.slug, documentId: document.documentId, heading: chunk.heading, anchor: chunk.anchor, excerpt: markdownToText(chunk.content).slice(0, 420), authority: "functional", sourceKind: "documentation", reviewStatus: document.reviewStatus, limitations: null, sourcePath: document.sourcePath, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
