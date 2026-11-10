import Link from "next/link";
import { activeVersion, navigation, recentDocuments } from "@/lib/content";
import type { NavItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let version: Awaited<ReturnType<typeof activeVersion>> = null;
  let nav: NavItem[] = [];
  let recent: NavItem[] = [];
  try {
    [version, nav, recent] = await Promise.all([activeVersion(), navigation(), recentDocuments()]);
  } catch {
    return <div className="setup-state"><span>A5</span><h1>Wiki lista para recibir contenido</h1><p>La base todavía no tiene un corpus publicado. Ejecutá las migraciones y la primera ingestión según el README del proyecto.</p><code>npm run db:migrate &amp;&amp; npm run ingest -- --source ../Architecture</code></div>;
  }
  const modules = [...new Set(nav.filter((item) => !item.isIndex).map((item) => item.module))];
  return <div className="home-page">
      <section className="hero"><p className="eyebrow">Base de conocimiento interna</p><h1>Todo AP5, en un solo lugar.</h1><p>Consultá el funcionamiento de pantallas, filtros, grillas, instrucciones, roles y dependencias técnicas con respaldo documental.</p><div className="version-pill"><span>Corpus publicado</span><code>{version?.commit_sha.slice(0, 8) || "sin versión"}</code></div></section>
      <section><div className="section-title"><div><p className="eyebrow">Explorar</p><h2>Módulos documentados</h2></div><span>{modules.length} módulos</span></div><div className="module-grid">{modules.map((moduleName, index) => { const first = nav.find((item) => item.module === moduleName && !item.isIndex); const count = nav.filter((item) => item.module === moduleName && !item.isIndex).length; return first && <Link href={`/docs/${first.slug}`} className="module-card" key={moduleName}><span className="module-number">{String(index + 1).padStart(2, "0")}</span><h3>{moduleName}</h3><p>{count} {count === 1 ? "pantalla" : "pantallas"}</p><b>Explorar →</b></Link>; })}</div></section>
      <section><div className="section-title"><div><p className="eyebrow">Acceso rápido</p><h2>Documentos destacados</h2></div></div><div className="recent-list">{recent.map((item) => <Link href={`/docs/${item.slug}`} key={item.slug}><span><small>{item.module}</small><strong>{item.title}</strong></span><code>{item.documentId}</code></Link>)}</div></section>
    </div>;
}
