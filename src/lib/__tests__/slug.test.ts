import { describe, expect, it } from "vitest";
import { resolveMarkdownLink, sourcePathToSlug } from "../slug";

describe("rutas documentales", () => {
  it("genera slugs estables para documentos e índices", () => {
    expect(sourcePathToSlug("Documentation/Operaciones/README.md")).toBe("operaciones");
    expect(sourcePathToSlug("Documentation/Activos/Activos Aceptados/DOC-0001-activos.md")).toBe("activos/activos-aceptados/doc-0001-activos");
  });
  it("resuelve enlaces markdown relativos", () => {
    expect(resolveMarkdownLink("Documentation/Activos/A/uno.md", "../B/dos.md#Filtros")).toBe("/docs/activos/b/dos#filtros");
  });
});
