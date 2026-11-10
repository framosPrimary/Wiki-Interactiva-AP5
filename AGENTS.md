# Agentes de Wiki Interactiva AP5

Este repositorio implementa la Wiki. `../Architecture/` es la fuente documental de solo lectura; `../PBP-Publicacion/` y `../Valquiria/` no forman parte de la aplicación y no deben modificarse ni consultarse en tiempo real desde ella.

El corpus público se limita a `Architecture/Documentation/**/*.md`. El catálogo, la cobertura y `Support/knowledge-index.json` solo se indexan como complementos rotulados. No incorporar `access`, `scratch`, `references`, sesiones, credenciales, antecedentes legacy ni evidencia cruda.

Toda respuesta sobre AP5 requiere citas. Un complemento nunca se presenta como regla funcional aprobada. El MVP no persiste conversaciones ni modifica el arnés.

Antes de cerrar cambios ejecutar `npm run typecheck`, `npm test`, `npm run lint` y `npm run build`. No guardar secretos en archivos versionados.
