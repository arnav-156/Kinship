import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiProviderError, createModelGateway } from "./index";

describe("AI provider resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies quota responses for operational handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );
    const gateway = createModelGateway({ apiKey: "primary-key", provider: "openai-compatible" });

    await expect(gateway.generateText({ prompt: "hello" })).rejects.toMatchObject({
      kind: "quota",
      statusCode: 429,
    });
  });

  it("aborts and classifies requests that exceed their timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );
    const gateway = createModelGateway({ apiKey: "primary-key", provider: "openai-compatible" });

    await expect(gateway.generateText({ prompt: "hello", timeoutMs: 5 })).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("classifies transport and malformed payload failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        json: async () => ({ choices: [] }),
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createModelGateway({ apiKey: "primary-key", provider: "openai-compatible" });

    await expect(gateway.generateText({ prompt: "first" })).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(gateway.generateText({ prompt: "second" })).rejects.toMatchObject({
      kind: "malformed-output",
    });
  });

  it("uses one fallback attempt after structured output remains malformed", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => ({
      json: async () => ({
        choices: [
          {
            message: {
              content: String(url).startsWith("https://fallback.example")
                ? JSON.stringify({ accepted: true })
                : "not json",
            },
          },
        ],
      }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createModelGateway({
      apiKey: "primary-key",
      baseUrl: "https://primary.example/v1",
      fallback: {
        apiKey: "fallback-key",
        baseUrl: "https://fallback.example/v1",
        provider: "openai-compatible",
      },
      provider: "openai-compatible",
    });

    await expect(
      gateway.generateStructured({
        prompt: "return acceptance",
        schema: z.object({ accepted: z.boolean() }),
      }),
    ).resolves.toEqual({ accepted: true });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://primary.example/v1/chat/completions",
      "https://primary.example/v1/chat/completions",
      "https://fallback.example/v1/chat/completions",
    ]);
  });

  it("falls back on quota without hiding authentication errors", async () => {
    const fallbackFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        json: async () => ({ choices: [{ message: { content: "fallback result" } }] }),
        ok: true,
      });
    vi.stubGlobal("fetch", fallbackFetch);
    const quotaGateway = createModelGateway({
      apiKey: "primary-key",
      fallback: {
        apiKey: "fallback-key",
        baseUrl: "https://fallback.example/v1",
        provider: "openai-compatible",
      },
      provider: "openai-compatible",
    });

    await expect(quotaGateway.generateText({ prompt: "hello" })).resolves.toMatchObject({
      outputText: "fallback result",
    });
    expect(fallbackFetch).toHaveBeenCalledTimes(2);

    const neverCalled = vi.fn();
    vi.stubGlobal("fetch", neverCalled);
    const authenticationGateway = createModelGateway({
      fallback: {
        apiKey: "fallback-key",
        provider: "openai-compatible",
      },
      provider: "openai-compatible",
    });
    let failure: unknown;
    try {
      await authenticationGateway.generateText({ prompt: "hello" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AiProviderError);
    expect(failure).toMatchObject({ kind: "authentication" });
    expect(neverCalled).not.toHaveBeenCalled();
  });
});
