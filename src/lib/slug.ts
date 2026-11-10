import path from "node:path";

export function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function headingAnchor(value: string): string {
  return slugPart(value) || "seccion";
}

export function sourcePathToSlug(sourcePath: string): string {
  const normalized = sourcePath.replaceAll("\\", "/").replace(/^Documentation\//, "");
  const parts = normalized.split("/");
  const file = parts.pop()!;
  if (!/^README\.md$/i.test(file)) parts.push(file.replace(/\.md$/i, ""));
  return parts.map(slugPart).filter(Boolean).join("/");
}

export function resolveMarkdownLink(currentSourcePath: string, href: string): string | null {
  if (!href || /^(?:https?:|mailto:|#)/i.test(href)) return null;
  const [target, anchor] = href.split("#", 2);
  if (!/\.md$/i.test(target)) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentSourcePath), target));
  const slug = sourcePathToSlug(resolved);
  return `/docs/${slug}${anchor ? `#${headingAnchor(decodeURIComponent(anchor))}` : ""}`;
}
