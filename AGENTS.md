# Agentes de Wiki Interactiva AP5

Este repositorio implementa la Wiki. `../Architecture/` es la fuente documental de solo lectura; `../PBP-Publicacion/` y `../Valquiria/` no forman parte de la aplicación y no deben modificarse ni consultarse en tiempo real desde ella.

El corpus público se limita a `Architecture/Documentation/**/*.md`. El catálogo, la cobertura y `Support/knowledge-index.json` solo se indexan como complementos rotulados. No incorporar `access`, `scratch`, `references`, sesiones, credenciales, antecedentes legacy ni evidencia cruda.

Toda respuesta sobre AP5 requiere citas. Un complemento nunca se presenta como regla funcional aprobada. El MVP no persiste conversaciones ni modifica el arnés.

Antes de cerrar cambios ejecutar `npm run typecheck`, `npm test`, `npm run lint` y `npm run build`. No guardar secretos en archivos versionados.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
