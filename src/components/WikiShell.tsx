"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { NavItem } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { GlobalSearch } from "./GlobalSearch";

export function WikiShell({ navigation, children }: { navigation: NavItem[]; children: ReactNode }) {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, NavItem[]>>();
    for (const item of navigation) {
      if (item.isIndex || (filter && !`${item.title} ${item.documentId ?? ""}`.toLowerCase().includes(filter.toLowerCase()))) continue;
      const moduleItems = map.get(item.module) ?? new Map<string, NavItem[]>();
      const key = item.submodule || "General";
      moduleItems.set(key, [...(moduleItems.get(key) ?? []), item]);
      map.set(item.module, moduleItems);
    }
    return map;
  }, [navigation, filter]);

  return <div className={`wiki-shell ${chatOpen ? "chat-visible" : ""} ${navigationOpen ? "nav-visible" : ""}`}>
    <header className="topbar">
      <button className="nav-toggle" onClick={() => setNavigationOpen((value) => !value)} aria-expanded={navigationOpen} aria-label="Abrir navegación">☰</button>
      <Link href="/" className="brand" aria-label="Inicio Wiki AP5"><span className="brand-mark">A5</span><span><strong>Wiki AP5</strong><small>Conocimiento operativo</small></span></Link>
      <GlobalSearch />
      <button className="chat-toggle" onClick={() => setChatOpen((value) => !value)} aria-expanded={chatOpen}>◈ {chatOpen ? "Ocultar agente" : "Abrir agente"}</button>
    </header>
    <aside className="sidebar" aria-label="Navegación documental">
      <label className="sidebar-filter"><span>Filtrar pantallas</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre o DOC…" /></label>
      <nav>
        {[...grouped].map(([moduleName, submodules]) => <details key={moduleName} open>
          <summary>{moduleName}</summary>
          {[...submodules].map(([submodule, items]) => <div className="nav-group" key={submodule}>
            {submodule !== "General" && <p>{submodule}</p>}
            {items.map((item) => {
              const href = `/docs/${item.slug}`;
              return <Link className={pathname === href ? "active" : ""} href={href} onClick={() => setNavigationOpen(false)} key={item.slug} title={item.documentId ?? item.title}>
                <span>{item.title}</span>{item.documentId && <small>{item.documentId}</small>}
              </Link>;
            })}
          </div>)}
        </details>)}
      </nav>
    </aside>
    <main className="content-pane">{children}</main>
    {chatOpen && <aside className="chat-pane" aria-label="Agente documental"><ChatPanel contextPath={pathname} /></aside>}
  </div>;
}
