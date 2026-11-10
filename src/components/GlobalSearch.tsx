"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchHit } from "@/lib/types";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { results: [] })
      .then((data) => { setResults(data.results); setOpen(true); })
      .catch(() => undefined), 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  const visibleResults = query.trim().length < 2 ? [] : results;
  return <div className="global-search">
    <span aria-hidden>⌕</span><input aria-label="Buscar en la Wiki" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => results.length && setOpen(true)} placeholder="Buscar pantalla, rol, URL, función SQL…" />
    {open && query.trim().length >= 2 && <div className="search-popover" role="dialog">
      <button className="close-search" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
      {visibleResults.length ? visibleResults.map((item, index) => item.slug ? <Link key={`${item.sourcePath}-${index}`} href={`/docs/${item.slug}${item.anchor ? `#${item.anchor}` : ""}`} onClick={() => setOpen(false)}>
        <strong>{item.title}</strong><span>{item.heading || item.documentId || item.sourceKind}</span><small>{item.authority === "functional" ? "Documentación funcional" : "Complemento rotulado"}</small>
      </Link> : <div className="search-supplement" key={`${item.sourcePath}-${index}`}><strong>{item.title}</strong><span>{item.heading}</span><small>Complemento interno</small></div>) : <p className="empty-state">Sin resultados.</p>}
    </div>}
  </div>;
}
