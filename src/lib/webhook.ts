import crypto from "node:crypto";
import { config } from "./config";

export function validWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const supplied = header.replace(/^sha256=/, "");
  const expected = crypto.createHmac("sha256", config().SYNC_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
