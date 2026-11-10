import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetConfigForTests } from "../config";
import { validWebhookSignature } from "../webhook";

describe("firma del webhook", () => {
  beforeEach(() => { process.env.SYNC_WEBHOOK_SECRET = "test-secret-value"; resetConfigForTests(); });
  it("acepta la firma exacta y rechaza cambios", () => {
    const body = '{"commitSha":"abcdef1"}';
    const signature = crypto.createHmac("sha256", "test-secret-value").update(body).digest("hex");
    expect(validWebhookSignature(body, `sha256=${signature}`)).toBe(true);
    expect(validWebhookSignature(`${body} `, `sha256=${signature}`)).toBe(false);
  });
});
