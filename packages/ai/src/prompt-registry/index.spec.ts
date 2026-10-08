import { describe, expect, it } from "vitest";

import {
  DRAFT_PROMPT_VERSION,
  PROMPT_VERSION,
  renderDraftPrompt,
  renderRelationshipBriefPrompt,
} from "../index";
import {
  DEFAULT_PROMPT_REGISTRY,
  comparePromptVersions,
  digestPromptRegistry,
  getActivePromptDefinition,
  parsePromptRegistry,
  renderPromptSystem,
} from "./index";

describe("prompt registry", () => {
  it("drives the active production brief and draft renderers without prompt drift", () => {
    const briefDefinition = getActivePromptDefinition("relationship-brief");
    const draftDefinition = getActivePromptDefinition("draft-message");
    const brief = renderRelationshipBriefPrompt({
      evidenceCards: [
        {
          confidenceScore: 0.9,
          evidenceId: "evidence_1",
          rankScore: 0.8,
          summary: "Ada maintains an analytical engine repository.",
        },
      ],
      goal: "research collaboration",
      subjectName: "Ada Lovelace",
    });
    const draft = renderDraftPrompt({
      brief: {
        channelRisk: "allowed",
        confidenceScore: 0.9,
        evidenceCards: [
          {
            confidenceScore: 0.9,
            evidenceId: "evidence_1",
            rankScore: 0.8,
            summary: "Ada maintains an analytical engine repository.",
          },
        ],
        fitScore: 0.8,
        freshnessMetadata: { staleEvidenceIds: [] },
        outreachAngles: [
          {
            evidenceIds: ["evidence_1"],
            label: "Public work",
            rationale: "Ada maintains an analytical engine repository.",
          },
        ],
        recommendedChannel: "email",
        relationshipStage: "prospect",
        summary: "Relevant public work.",
        warnings: [],
      },
      goal: "research collaboration",
      subjectName: "Ada Lovelace",
      variant: "concise",
    });

    expect(PROMPT_VERSION).toBe("relationship-brief-v1");
    expect(DRAFT_PROMPT_VERSION).toBe("draft-message-v1");
    expect(brief.systemPrompt).toBe(renderPromptSystem(briefDefinition));
    expect(brief.temperature).toBe(briefDefinition.modelParameters.temperature);
    expect(JSON.parse(brief.prompt).task).toBe(briefDefinition.userInstructions.default);
    expect(draft.systemPrompt).toBe(renderPromptSystem(draftDefinition));
    expect(draft.temperature).toBe(draftDefinition.modelParameters.temperature);
    expect(JSON.parse(draft.prompt).task).toBe(draftDefinition.userInstructions.initial);
  });

  it("compares active and candidate versions with deterministic structural changes", () => {
    const comparison = comparePromptVersions(DEFAULT_PROMPT_REGISTRY, "relationship-brief", 1, 2);

    expect(comparison).toMatchObject({
      contentChanged: true,
      guardrails: { added: ["explicit_citation_coverage"], removed: [] },
      modelParameters: { temperature: { after: 0.1, before: 0.2 } },
      promptId: "relationship-brief",
      riskFlags: [],
      variables: { added: [], removed: [] },
    });
    expect(comparison.systemInstructions.added).toHaveLength(1);
    expect(comparison.userInstructions).toHaveLength(1);
  });

  it("flags guardrail removal, system-instruction removal, and temperature increases", () => {
    const registry = structuredClone(DEFAULT_PROMPT_REGISTRY);
    const candidate = registry.prompts.find(
      (prompt) => prompt.versionId === "relationship-brief-v2",
    );
    if (!candidate) {
      throw new Error("Expected candidate prompt");
    }
    candidate.guardrails = candidate.guardrails.slice(1);
    candidate.systemInstructions = candidate.systemInstructions.slice(1);
    candidate.modelParameters.temperature = 0.9;

    const comparison = comparePromptVersions(registry, "relationship-brief", 1, 2);
    expect(comparison.riskFlags).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Removed guardrails:/),
        expect.stringMatching(/^Removed system instructions:/),
        "Temperature increased from 0.2 to 0.9",
      ]),
    );
  });

  it("rejects duplicate versions and registries without exactly one active version", () => {
    const duplicate = structuredClone(DEFAULT_PROMPT_REGISTRY);
    duplicate.prompts.push(structuredClone(duplicate.prompts[0]!));
    expect(() => parsePromptRegistry(duplicate)).toThrow(/Duplicate versionId/);

    const noActive = structuredClone(DEFAULT_PROMPT_REGISTRY);
    const active = noActive.prompts.find((prompt) => prompt.versionId === "draft-message-v1");
    if (active) {
      active.status = "retired";
    }
    expect(() => parsePromptRegistry(noActive)).toThrow(/exactly one active version/);
  });

  it("produces a stable registry digest", () => {
    expect(digestPromptRegistry(DEFAULT_PROMPT_REGISTRY)).toBe(
      digestPromptRegistry(structuredClone(DEFAULT_PROMPT_REGISTRY)),
    );
    expect(digestPromptRegistry(DEFAULT_PROMPT_REGISTRY)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
