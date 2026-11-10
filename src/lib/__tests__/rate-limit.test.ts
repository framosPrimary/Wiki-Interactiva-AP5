import { describe, expect, it } from "vitest";
import { allowRequest } from "../rate-limit";

describe("rate limit", () => {
  it("limita por ventana y permite al reiniciarse", () => {
    expect(allowRequest("test-key", 2, 0)).toBe(true);
    expect(allowRequest("test-key", 2, 1)).toBe(true);
    expect(allowRequest("test-key", 2, 2)).toBe(false);
    expect(allowRequest("test-key", 2, 60_001)).toBe(true);
  });
});
