import { describe, expect, it } from "vitest";
import { chunkMarkdown, extractHeadings, extractTitle } from "../markdown";

describe("markdown", () => {
  const sample = "# Pantalla Ágil\n\nIntroducción.\n\n## Filtros de la grilla\n\nDetalle.\n\n## Filtros de la grilla\n\nOtro.";
  it("extrae título y anchors únicos", () => {
    expect(extractTitle(sample, "x")).toBe("Pantalla Ágil");
    expect(extractHeadings(sample).map((item) => item.anchor)).toEqual(["pantalla-ágil", "filtros-de-la-grilla", "filtros-de-la-grilla-1"]);
  });
  it("fragmenta conservando encabezados", () => {
    expect(chunkMarkdown(sample)).toHaveLength(3);
    expect(chunkMarkdown(sample)[1].heading).toBe("Filtros de la grilla");
  });
});
