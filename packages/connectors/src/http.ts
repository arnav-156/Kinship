import { ConnectorError, ConnectorPolicyError } from "./errors";
import { assertSafePublicUrl, defaultDnsResolver } from "./safe-url";
import type { DnsResolver, FetchLike, FetchResult } from "./types";

export interface SafeFetchOptions {
  fetchImpl?: FetchLike;
  maxBytes?: number;
  now?: () => Date;
  resolver?: DnsResolver;
  sourceType: FetchResult["sourceType"];
  timeoutMs: number;
}

export async function safeFetchText(url: string, options: SafeFetchOptions): Promise<FetchResult> {
  const resolver = options.resolver ?? defaultDnsResolver;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const safeUrl = await assertSafePublicUrl(url, resolver);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetchImpl(safeUrl.toString(), {
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new ConnectorPolicyError("Redirects are not followed by safe fetch");
    }

    if (!response.ok) {
      throw new ConnectorError(`Fetch failed with status ${response.status}`, "FETCH_FAILED", true);
    }

    const rawText = await response.text();
    const maxBytes = options.maxBytes ?? 250_000;
    const truncated = Buffer.byteLength(rawText, "utf8") > maxBytes;
    const text = truncated ? rawText.slice(0, maxBytes) : rawText;

    return {
      contentHash: "",
      contentType: response.headers.get("content-type") ?? "text/plain",
      rawText: text,
      retrievedAt: (options.now?.() ?? new Date()).toISOString(),
      sourceIdentifier: safeUrl.toString(),
      sourceType: options.sourceType,
      sourceUrl: safeUrl.toString(),
    };
  } catch (error) {
    if (error instanceof ConnectorError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ConnectorError("Fetch timed out", "FETCH_TIMEOUT", true);
    }

    throw new ConnectorError("Fetch failed", "FETCH_FAILED", true);
  } finally {
    clearTimeout(timeout);
  }
}
