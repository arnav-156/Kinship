import { describe, expect, it } from "vitest";

import { ConnectorPolicyError } from "./errors";
import { assertSafePublicUrl, isPublicAddress } from "./safe-url";
import type { DnsResolver } from "./types";

const publicResolver: DnsResolver = async () => [{ address: "93.184.216.34", family: 4 }];
const privateResolver: DnsResolver = async () => [{ address: "127.0.0.1", family: 4 }];

describe("safe URL policy", () => {
  it("allows public HTTPS URLs", async () => {
    await expect(
      assertSafePublicUrl("https://example.com/profile", publicResolver),
    ).resolves.toMatchObject({
      hostname: "example.com",
    });
  });

  it("blocks localhost and private ranges after DNS resolution", async () => {
    await expect(assertSafePublicUrl("https://example.com", privateResolver)).rejects.toThrow(
      ConnectorPolicyError,
    );
  });

  it("blocks unsupported protocols", async () => {
    await expect(assertSafePublicUrl("file:///etc/passwd", publicResolver)).rejects.toThrow(
      ConnectorPolicyError,
    );
  });

  it("classifies private addresses as unsafe", () => {
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("172.16.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });
});
