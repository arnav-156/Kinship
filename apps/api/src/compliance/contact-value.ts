import crypto from "node:crypto";

export function hashContactValue(channelType: string, value: string): string {
  return crypto
    .createHash("sha256")
    .update(`${channelType}:${value.trim().toLowerCase()}`)
    .digest("hex");
}
