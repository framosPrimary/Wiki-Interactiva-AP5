import { describe, expect, it } from "vitest";
import { assertNoSensitiveContent } from "../ingestion";

describe("protección del índice", () => {
  it("rechaza credenciales y claves privadas", () => {
    expect(() => assertNoSensitiveContent("doc.md", "password=valorSecreto123")).toThrow(/credencial/i);
    expect(() => assertNoSensitiveContent("doc.md", "-----BEGIN PRIVATE KEY-----")).toThrow(/sensible/i);
  });

  it("admite referencias a variables y valores redactados", () => {
    expect(() => assertNoSensitiveContent("doc.md", "password=${DB_PASSWORD}\nsecret=<redacted>\nAPI_KEY=change-me-local")).not.toThrow();
  });
});
