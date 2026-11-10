import { headingAnchor } from "./slug";
import type { Heading } from "./types";
import GithubSlugger from "github-slugger";

export function extractTitle(content: string, fallback: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

export function extractHeadings(content: string): Heading[] {
  const slugger = new GithubSlugger();
  return [...content.matchAll(/^(#{1,4})\s+(.+)$/gm)].map((match) => {
    const text = match[2].replace(/[*_`]/g, "").trim();
    return { level: match[1].length, text, anchor: slugger.slug(text) };
  });
}

export function markdownToText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MarkdownChunk {
  heading: string | null;
  anchor: string | null;
  content: string;
}

export function chunkMarkdown(content: string, maxLength = 2800): MarkdownChunk[] {
  const headings = extractHeadings(content);
  const sections = content.split(/(?=^#{1,4}\s+)/gm).filter((part) => part.trim());
  const result: MarkdownChunk[] = [];
  let headingIndex = 0;
  for (const section of sections) {
    const headingMatch = section.match(/^#{1,4}\s+(.+)$/m);
    const heading = headingMatch?.[1]?.replace(/[*_`]/g, "").trim() ?? null;
    const anchor = heading ? headings[headingIndex++]?.anchor ?? headingAnchor(heading) : null;
    const paragraphs = section.split(/\n{2,}/).filter(Boolean);
    let buffer = "";
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length > maxLength) {
        result.push({ heading, anchor, content: buffer.trim() });
        buffer = "";
      }
      buffer += `${buffer ? "\n\n" : ""}${paragraph}`;
    }
    if (buffer.trim()) result.push({ heading, anchor, content: buffer.trim() });
  }
  return result;
}
