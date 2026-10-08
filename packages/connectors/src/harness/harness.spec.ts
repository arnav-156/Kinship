import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConnectorFixtures, validateConnectorFixture } from "./fixture";
import { replayConnectorFixture } from "./replay";
import type { ConnectorFixture } from "./types";

const fixturesPath = path.resolve(__dirname, "../../fixtures");

describe("connector development harness", () => {
  it("validates and deterministically replays every committed fixture", async () => {
    const fixtures = loadConnectorFixtures([fixturesPath]);
    expect(fixtures.length).toBeGreaterThanOrEqual(2);

    for (const fixture of fixtures) {
      const first = await replayConnectorFixture(fixture);
      const second = await replayConnectorFixture(fixture);
      expect(first.digest).toBe(second.digest);
      expect(first.digest).toBe(fixture.expected.replayDigest);
      expect(first.evidenceCount).toBe(fixture.expected.evidenceCount);
    }
  });

  it("rejects tenant/workspace scope drift", () => {
    const fixture = githubFixture();
    fixture.request.workspaceId = "another-workspace";
    expect(() => validateConnectorFixture(fixture)).toThrow(/exactly match the declared scope/);
  });

  it("rejects undeclared context keys", () => {
    const fixture = githubFixture();
    fixture.request.context = { accessToken: "must-not-be-used" };
    expect(() => validateConnectorFixture(fixture)).toThrow(/not declared/);
  });

  it("rejects hosts and private DNS addresses outside the recording scope", () => {
    const fixture = githubFixture();
    fixture.recording.dns = {
      "api.github.com": [{ address: "127.0.0.1", family: 4 }],
    };
    expect(() => validateConnectorFixture(fixture)).toThrow(/private or invalid/);

    const hostFixture = githubFixture();
    if (!hostFixture.recording.http) {
      throw new Error("Expected GitHub HTTP recording");
    }
    hostFixture.recording.http.requestUrl = "https://example.net/repos/openai/openai-node";
    expect(() => validateConnectorFixture(hostFixture)).toThrow(/outside scope/);
  });

  it("rejects recorded credentials", () => {
    const fixture = githubFixture();
    if (!fixture.recording.http) {
      throw new Error("Expected GitHub HTTP recording");
    }
    fixture.recording.http.response.headers.authorization = "Bearer example";
    expect(() => validateConnectorFixture(fixture)).toThrow(/sensitive field/);
  });
});

function githubFixture(): ConnectorFixture {
  const fixture = loadConnectorFixtures([fixturesPath]).find(
    (item) => item.sourceType === "github",
  );
  if (!fixture) {
    throw new Error("GitHub fixture is missing");
  }
  return structuredClone(fixture);
}
