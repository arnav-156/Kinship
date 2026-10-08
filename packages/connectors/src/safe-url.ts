import dns from "node:dns/promises";
import net from "node:net";

import { ConnectorPolicyError } from "./errors";
import type { DnsResolver, ResolvedAddress } from "./types";

const metadataServiceIp = "169.254.169.254";

export const defaultDnsResolver: DnsResolver = async (
  hostname: string,
): Promise<ResolvedAddress[]> => {
  const results = await dns.lookup(hostname, {
    all: true,
  });

  return results.map((result) => ({
    address: result.address,
    family: result.family as 4 | 6,
  }));
};

export async function assertSafePublicUrl(
  input: string,
  resolver: DnsResolver = defaultDnsResolver,
): Promise<URL> {
  const url = parseUrl(input);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ConnectorPolicyError("Only HTTP and HTTPS URLs are supported");
  }

  if (!url.hostname || url.username || url.password) {
    throw new ConnectorPolicyError("URL must not contain credentials");
  }

  const addresses = await resolver(url.hostname);
  if (addresses.length === 0) {
    throw new ConnectorPolicyError("URL hostname could not be resolved");
  }

  for (const resolved of addresses) {
    if (!isPublicAddress(resolved.address)) {
      throw new ConnectorPolicyError("URL resolved to a private or unsafe network address");
    }
  }

  return url;
}

function parseUrl(input: string): URL {
  try {
    return new URL(input);
  } catch {
    throw new ConnectorPolicyError("Invalid URL");
  }
}

export function isPublicAddress(address: string): boolean {
  if (address === metadataServiceIp) {
    return false;
  }

  const version = net.isIP(address);
  if (version === 4) {
    return isPublicIpv4(address);
  }

  if (version === 6) {
    return isPublicIpv6(address);
  }

  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  if (a === 10 || a === 127 || a === 0) {
    return false;
  }

  if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
    return false;
  }

  if (a === 192 && b === 168) {
    return false;
  }

  if (a === 169 && b === 254) {
    return false;
  }

  if (a === 100 && b !== undefined && b >= 64 && b <= 127) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
