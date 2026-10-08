#!/usr/bin/env node
import path from "node:path";

import { loadConnectorFixtures } from "./fixture";
import { replayConnectorFixture } from "./replay";

type Command = "digest" | "replay" | "validate";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = (args.shift() ?? "replay") as Command;
  if (!["digest", "replay", "validate"].includes(command)) {
    throw new Error(`Unknown command ${command}. Use validate, digest, or replay.`);
  }

  const repeatIndex = args.indexOf("--repeat");
  let repeat = 1;
  if (repeatIndex >= 0) {
    const raw = args[repeatIndex + 1];
    repeat = Number(raw);
    if (!raw || !Number.isInteger(repeat) || repeat < 1) {
      throw new Error("--repeat must be followed by a positive integer");
    }
    args.splice(repeatIndex, 2);
  }
  if (command !== "replay" && repeat !== 1) {
    throw new Error("--repeat is supported only by the replay command");
  }

  const fixturePaths = args.length > 0 ? args : [path.resolve(__dirname, "../../fixtures")];
  const fixtures = loadConnectorFixtures(fixturePaths);
  if (command === "validate") {
    for (const fixture of fixtures) {
      console.log(`validated ${fixture.name} (${fixture.sourceType})`);
    }
    return;
  }

  for (const fixture of fixtures) {
    let initialDigest: string | undefined;
    for (let iteration = 1; iteration <= repeat; iteration += 1) {
      const result = await replayConnectorFixture(fixture, {
        verifyExpected: command === "replay",
      });
      initialDigest ??= result.digest;
      if (result.digest !== initialDigest) {
        throw new Error(`${fixture.name}: replay ${iteration} produced a non-deterministic digest`);
      }
    }
    console.log(
      `${command === "digest" ? "digest" : "replayed"} ${fixture.name} ${initialDigest} (${repeat} run${repeat === 1 ? "" : "s"})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
