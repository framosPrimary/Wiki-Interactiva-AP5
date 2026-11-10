import path from "node:path";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { WikiDocument } from "@/lib/types";
import { resolveMarkdownLink } from "@/lib/slug";

function encodePath(value: string): string { return value.split("/").map(encodeURIComponent).join("/"); }

export function DocumentView({ document }: { document: WikiDocument }) {
  const breadcrumbs = [document.module, ...(document.submodule ? document.submodule.split(" → ") : []), document.title];
  return <article className="document-layout">
    <div className="document-main">
      <nav className="breadcrumbs">{breadcrumbs.map((item, index) => <span key={`${item}-${index}`}>{index ? "›" : ""} {item}</span>)}</nav>
      <div className="document-meta"><span>{document.documentId || "Índice"}</span>{document.revision && <span>Revisión {document.revision}</span>}<span className={`status ${document.reviewStatus}`}>{document.reviewStatus?.replaceAll("_", " ") || "sin estado"}</span></div>
      <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]]} components={{
        a: ({ href = "", children }) => {
          const internal = resolveMarkdownLink(document.sourcePath, href);
          if (internal) return <Link href={internal}>{children}</Link>;
          if (/^https?:/i.test(href)) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          return <span title="Recurso interno no publicado">{children}</span>;
        },
        img: ({ src = "", alt = "" }) => {
          const imageSource = typeof src === "string" ? src : "";
          if (/^(?:https?:|data:)/i.test(imageSource)) return <img src={imageSource} alt={alt} loading="lazy" />;
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(document.sourcePath), imageSource));
          return <img src={`/api/assets/${document.versionId}/${encodePath(resolved)}`} alt={alt} loading="lazy" />;
        },
      }}>{document.content}</ReactMarkdown></div>
    </div>
    <aside className="toc"><strong>En esta página</strong>{document.headings.filter((heading) => heading.level > 1 && heading.level < 4).map((heading) => <a className={`level-${heading.level}`} href={`#${heading.anchor}`} key={heading.anchor}>{heading.text}</a>)}</aside>
  </article>;
}
