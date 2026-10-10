import { z } from "zod";

import {
  getActivePromptDefinition,
  renderPromptSystem,
  type PromptDefinition,
} from "./prompt-registry";

const relationshipBriefPrompt = getActivePromptDefinition("relationship-brief");
const draftMessagePrompt = getActivePromptDefinition("draft-message");

export const PROMPT_VERSION = relationshipBriefPrompt.versionId;
export const DRAFT_PROMPT_VERSION = draftMessagePrompt.versionId;

export interface GenerateTextRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateTextResponse {
  model: string;
  outputText: string;
  provider: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface GenerateStructuredRequest<
  TSchema extends z.ZodTypeAny,
> extends GenerateTextRequest {
  schema: TSchema;
}

export interface EmbeddingRequest {
  input: string;
  timeoutMs?: number;
}

export interface EmbeddingResponse {
  dimensions: number;
  embedding: number[];
  model: string;
  provider: string;
}

export interface ModelGateway {
  embedText(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  generateStructured<TSchema extends z.ZodTypeAny>(
    request: GenerateStructuredRequest<TSchema>,
  ): Promise<z.infer<TSchema>>;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResponse>;
}

export type AiProviderFailureKind =
  "authentication" | "invalid-request" | "malformed-output" | "quota" | "timeout" | "unavailable";

export class AiProviderError extends Error {
  readonly kind: AiProviderFailureKind;
  readonly statusCode?: number;

  constructor(
    message: string,
    options: { cause?: unknown; kind: AiProviderFailureKind; statusCode?: number },
  ) {
    super(message, { cause: options.cause });
    this.name = "AiProviderError";
    this.kind = options.kind;
    this.statusCode = options.statusCode;
  }
}

export interface SingleModelGatewayOptions {
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  provider?: "mock" | "openai-compatible";
}

export interface ModelGatewayOptions extends SingleModelGatewayOptions {
  fallback?: SingleModelGatewayOptions;
}

export interface EmbedTextsOptions {
  expectedDimensions: number;
  ignoredProviders?: string[];
  timeoutMs?: number;
}

export async function embedTexts(
  gateway: Pick<ModelGateway, "embedText">,
  inputs: string[],
  options: EmbedTextsOptions,
): Promise<Array<number[] | undefined>> {
  if (!Number.isInteger(options.expectedDimensions) || options.expectedDimensions < 1) {
    throw new Error("expectedDimensions must be a positive integer");
  }
  const ignoredProviders = new Set(options.ignoredProviders ?? []);
  const embeddings: Array<number[] | undefined> = [];
  for (const input of inputs) {
    const response = await gateway.embedText({ input, timeoutMs: options.timeoutMs });
    if (ignoredProviders.has(response.provider)) {
      embeddings.push(undefined);
      continue;
    }
    if (
      response.dimensions !== options.expectedDimensions ||
      response.embedding.length !== options.expectedDimensions ||
      response.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding provider returned ${response.dimensions}/${response.embedding.length} dimensions; expected ${options.expectedDimensions} finite values`,
      );
    }
    embeddings.push(response.embedding);
  }
  return embeddings;
}

export const EvidenceCardSchema = z.object({
  confidenceScore: z.number().min(0).max(1),
  evidenceId: z.string().min(1),
  rankScore: z.number().min(0).max(1),
  sourceType: z.string().optional(),
  summary: z.string().min(1),
});

export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;

export type AiTrustLevel = "safe" | "review" | "blocked";

export interface AiTrustSummaryInput {
  blockedReasons?: string[];
  confidenceScore?: number | null;
  evidenceCards: EvidenceCard[];
  unsupportedClaims?: string[];
  warnings?: string[];
}

export interface AiTrustSummary {
  level: AiTrustLevel;
  promptInjectionEvidenceIds: string[];
  reasons: string[];
  unsupportedClaimCount: number;
}

export const OutreachAngleSchema = z.object({
  evidenceIds: z.array(z.string().min(1)).min(1),
  label: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
});

export type OutreachAngle = z.infer<typeof OutreachAngleSchema>;

export const RelationshipBriefOutputSchema = z.object({
  channelRisk: z.enum(["allowed", "warn", "blocked"]).default("warn"),
  confidenceScore: z.number().min(0).max(1),
  evidenceCards: z.array(EvidenceCardSchema).min(1),
  fitScore: z.number().min(0).max(1),
  freshnessMetadata: z.object({
    newestEvidenceId: z.string().optional(),
    staleEvidenceIds: z.array(z.string()).default([]),
  }),
  outreachAngles: z.array(OutreachAngleSchema).min(1).max(5),
  recommendedChannel: z.enum(["email", "linkedin_context", "phone", "meeting", "unknown"]),
  relationshipStage: z.enum([
    "unknown",
    "prospect",
    "warm",
    "active",
    "dormant",
    "customer",
    "partner",
  ]),
  summary: z.string().min(1).max(2000),
  warnings: z.array(z.string()).default([]),
});

export type RelationshipBriefOutput = z.infer<typeof RelationshipBriefOutputSchema>;

export const EvidenceClaimSchema = z.object({
  evidenceIds: z.array(z.string().min(1)).min(1),
  text: z.string().min(1).max(500),
});

export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const DraftMessageOutputSchema = z.object({
  body: z.string().min(1).max(4000),
  channelType: z.enum(["email", "linkedin_context", "phone", "meeting", "unknown"]),
  evidenceClaims: z.array(EvidenceClaimSchema).min(1),
  status: z.enum(["draft", "needs_review", "validated", "blocked"]),
  tone: z.string().min(1).max(80),
  validationResult: z.object({
    blockedReasons: z.array(z.string()).default([]),
    citedEvidenceIds: z.array(z.string()).default([]),
    unsupportedClaims: z.array(z.string()).default([]),
  }),
  variant: z.enum(["concise", "warm_professional", "evidence_heavy"]),
});

export type DraftMessageOutput = z.infer<typeof DraftMessageOutputSchema>;

export interface PromptInput {
  evidenceCards: EvidenceCard[];
  goal: string;
  subjectName: string;
}

export function createModelGateway(options: ModelGatewayOptions = {}): ModelGateway {
  const primary = createSingleModelGateway(options);
  return options.fallback
    ? new FallbackModelGateway(primary, createSingleModelGateway(options.fallback))
    : primary;
}

function createSingleModelGateway(options: SingleModelGatewayOptions): ModelGateway {
  const provider = options.provider ?? "mock";
  if (provider === "openai-compatible") {
    return new OpenAiCompatibleGateway(options);
  }

  return new MockModelGateway(options);
}

export function renderRelationshipBriefPrompt(input: PromptInput): GenerateTextRequest {
  return {
    prompt: JSON.stringify(
      {
        evidenceCards: input.evidenceCards.map(sanitizeEvidenceCard),
        goal: input.goal,
        subjectName: input.subjectName,
        task: requiredUserInstruction(relationshipBriefPrompt, "default"),
      },
      null,
      2,
    ),
    systemPrompt: renderPromptSystem(relationshipBriefPrompt),
    temperature: relationshipBriefPrompt.modelParameters.temperature,
  };
}

export function renderDraftPrompt(input: {
  brief: RelationshipBriefOutput;
  currentBody?: string;
  goal: string;
  rewriteInstruction?: string;
  subjectName: string;
  variant: DraftMessageOutput["variant"];
}): GenerateTextRequest {
  return {
    prompt: JSON.stringify(
      {
        brief: input.brief,
        currentBody: input.currentBody,
        goal: input.goal,
        rewriteInstruction: input.rewriteInstruction,
        subjectName: input.subjectName,
        task: input.currentBody
          ? requiredUserInstruction(draftMessagePrompt, "revision")
          : requiredUserInstruction(draftMessagePrompt, "initial"),
        variant: input.variant,
      },
      null,
      2,
    ),
    systemPrompt: renderPromptSystem(draftMessagePrompt),
    temperature: draftMessagePrompt.modelParameters.temperature,
  };
}

export function buildDeterministicBrief(input: PromptInput): RelationshipBriefOutput {
  const evidenceCards = input.evidenceCards.slice(0, 8);
  if (evidenceCards.length === 0) {
    throw new Error("Relationship brief generation requires at least one evidence card");
  }

  const averageRank =
    evidenceCards.reduce((total, card) => total + card.rankScore, 0) / evidenceCards.length;
  const averageConfidence =
    evidenceCards.reduce((total, card) => total + card.confidenceScore, 0) / evidenceCards.length;
  const topEvidence = evidenceCards[0]!;
  const warnings = evidenceCards.some((card) => card.confidenceScore < 0.5)
    ? ["Some supporting evidence has low confidence and should be reviewed."]
    : [];

  return {
    channelRisk: warnings.length > 0 ? "warn" : "allowed",
    confidenceScore: roundScore(averageConfidence),
    evidenceCards,
    fitScore: roundScore(Math.max(0.25, averageRank)),
    freshnessMetadata: {
      newestEvidenceId: topEvidence.evidenceId,
      staleEvidenceIds: [],
    },
    outreachAngles: [
      {
        evidenceIds: [topEvidence.evidenceId],
        label: "Evidence-backed relevance",
        rationale: `${input.subjectName} has a relevant signal for ${input.goal}: ${topEvidence.summary}`,
      },
    ],
    recommendedChannel: "email",
    relationshipStage: "prospect",
    summary: `${input.subjectName} appears relevant to "${input.goal}" based on ${evidenceCards.length} evidence item(s). Strongest signal: ${topEvidence.summary}`,
    warnings,
  };
}

export function buildDeterministicDraft(input: {
  brief: RelationshipBriefOutput;
  goal: string;
  subjectName: string;
  variant: DraftMessageOutput["variant"];
}): DraftMessageOutput {
  const angle = input.brief.outreachAngles[0];
  if (!angle) {
    throw new Error("Draft generation requires at least one outreach angle");
  }

  const body =
    input.variant === "concise"
      ? `Hi ${input.subjectName}, I noticed ${angle.rationale}. I am exploring ${input.goal} and thought it could be worth a short conversation.`
      : input.variant === "evidence_heavy"
        ? `Hi ${input.subjectName}, I came across a few relevant signals while researching ${input.goal}. ${input.brief.summary} ${angle.rationale}. Would you be open to comparing notes?`
        : `Hi ${input.subjectName}, I noticed ${angle.rationale}. I am working on ${input.goal} and thought there may be a useful overlap. Would a brief conversation make sense?`;

  const citedEvidenceIds = [...new Set(angle.evidenceIds)];
  return {
    body,
    channelType: input.brief.recommendedChannel,
    evidenceClaims: [
      {
        evidenceIds: citedEvidenceIds,
        text: angle.rationale,
      },
    ],
    status: input.brief.channelRisk === "blocked" ? "blocked" : "needs_review",
    tone: input.variant === "concise" ? "concise" : "warm professional",
    validationResult: {
      blockedReasons:
        input.brief.channelRisk === "blocked" ? ["Brief channel risk is blocked."] : [],
      citedEvidenceIds,
      unsupportedClaims: [],
    },
    variant: input.variant,
  };
}

export function summarizeAiTrust(input: AiTrustSummaryInput): AiTrustSummary {
  const unsupportedClaims = dedupeStrings(input.unsupportedClaims ?? []);
  const blockedReasons = dedupeStrings(input.blockedReasons ?? []);
  const warnings = dedupeStrings(input.warnings ?? []);
  const promptInjectionEvidenceIds = dedupeStrings([
    ...detectPromptInjection(input.evidenceCards),
    ...warnings.flatMap((warning) => extractPromptInjectionEvidenceIds(warning)),
  ]);
  const reasons: string[] = [];

  if (unsupportedClaims.length > 0) {
    reasons.push(`${unsupportedClaims.length} unsupported claim(s) require removal or evidence.`);
  }

  if (blockedReasons.length > 0) {
    reasons.push(...blockedReasons);
  }

  if (promptInjectionEvidenceIds.length > 0) {
    reasons.push(
      `Potential prompt injection detected in evidence: ${promptInjectionEvidenceIds.join(", ")}`,
    );
  }

  if ((input.confidenceScore ?? 1) < 0.55) {
    reasons.push("Overall confidence is low; human review is required.");
  }

  const nonInjectionWarnings = warnings.filter(
    (warning) => extractPromptInjectionEvidenceIds(warning).length === 0,
  );
  reasons.push(...nonInjectionWarnings);

  const level: AiTrustLevel =
    unsupportedClaims.length > 0 || blockedReasons.length > 0
      ? "blocked"
      : reasons.length > 0
        ? "review"
        : "safe";

  return {
    level,
    promptInjectionEvidenceIds,
    reasons: dedupeStrings(reasons),
    unsupportedClaimCount: unsupportedClaims.length,
  };
}
export function validateEvidenceCoverage(
  claims: EvidenceClaim[],
  evidenceCards: EvidenceCard[],
): {
  citedEvidenceIds: string[];
  unsupportedClaims: string[];
} {
  const allowedIds = new Set(evidenceCards.map((card) => card.evidenceId));
  const citedEvidenceIds = [...new Set(claims.flatMap((claim) => claim.evidenceIds))];
  const unsupportedClaims = claims
    .filter((claim) => claim.evidenceIds.some((id) => !allowedIds.has(id)))
    .map((claim) => claim.text);

  return {
    citedEvidenceIds,
    unsupportedClaims,
  };
}

export function detectPromptInjection(evidenceCards: EvidenceCard[]): string[] {
  const injectionPatterns = [
    /ignore (all )?(previous|prior|system) instructions/i,
    /disregard (all )?(previous|prior|system|developer|hidden) (directions|instructions|rules)/i,
    /override (all )?(previous|prior|system|developer) (directions|instructions|rules)/i,
    /hidden developer (message|rules|instructions)/i,
    /ignore safety/i,
    /jailbreak/i,
    /print hidden/i,
    /developer message/i,
    /system prompt/i,
    /reveal.*secret/i,
    /act as/i,
  ];

  return evidenceCards
    .filter((card) => injectionPatterns.some((pattern) => pattern.test(card.summary)))
    .map((card) => card.evidenceId);
}

export async function generateRelationshipBrief(
  gateway: ModelGateway,
  input: PromptInput,
): Promise<RelationshipBriefOutput> {
  const injectionEvidenceIds = detectPromptInjection(input.evidenceCards);
  const prompt = renderRelationshipBriefPrompt(input);
  const output = await gateway.generateStructured({
    ...prompt,
    schema: RelationshipBriefOutputSchema,
  });
  const parsed = RelationshipBriefOutputSchema.parse(output);

  const coverage = validateEvidenceCoverage(
    parsed.outreachAngles.map((angle) => ({
      evidenceIds: angle.evidenceIds,
      text: angle.rationale,
    })),
    input.evidenceCards,
  );

  return {
    ...parsed,
    warnings: [
      ...parsed.warnings,
      ...coverage.unsupportedClaims.map((claim) => `Unsupported claim: ${claim}`),
      ...injectionEvidenceIds.map((id) => `Potential prompt injection in evidence ${id}`),
    ],
  };
}

export async function generateDraftMessage(
  gateway: ModelGateway,
  input: {
    brief: RelationshipBriefOutput;
    currentBody?: string;
    goal: string;
    rewriteInstruction?: string;
    subjectName: string;
    variant: DraftMessageOutput["variant"];
  },
): Promise<DraftMessageOutput> {
  const prompt = renderDraftPrompt(input);
  const output = await gateway.generateStructured({
    ...prompt,
    schema: DraftMessageOutputSchema,
  });
  const parsed = DraftMessageOutputSchema.parse(output);
  const coverage = validateEvidenceCoverage(parsed.evidenceClaims, input.brief.evidenceCards);
  const unsupportedClaims = dedupeStrings([
    ...parsed.validationResult.unsupportedClaims,
    ...coverage.unsupportedClaims,
  ]);

  return {
    ...parsed,
    status: unsupportedClaims.length > 0 ? "blocked" : parsed.status,
    validationResult: {
      ...parsed.validationResult,
      citedEvidenceIds: coverage.citedEvidenceIds,
      unsupportedClaims,
    },
  };
}

class FallbackModelGateway implements ModelGateway {
  constructor(
    private readonly primary: ModelGateway,
    private readonly fallback: ModelGateway,
  ) {}

  embedText(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return runWithFallback(
      () => this.primary.embedText(request),
      () => this.fallback.embedText(request),
    );
  }

  generateStructured<TSchema extends z.ZodTypeAny>(
    request: GenerateStructuredRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    return runWithFallback(
      () => this.primary.generateStructured(request),
      () => this.fallback.generateStructured(request),
    );
  }

  generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    return runWithFallback(
      () => this.primary.generateText(request),
      () => this.fallback.generateText(request),
    );
  }
}

class MockModelGateway implements ModelGateway {
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(options: SingleModelGatewayOptions) {
    this.chatModel = options.chatModel ?? "mock-relationship-model";
    this.embeddingModel = options.embeddingModel ?? "mock-embedding-model";
  }

  async embedText(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const dimensions = 16;
    const embedding = Array.from({ length: dimensions }, (_, index) =>
      roundScore((((hashText(request.input) >> (index % 16)) & 255) / 255) * 2 - 1),
    );

    return {
      dimensions,
      embedding,
      model: this.embeddingModel,
      provider: "mock",
    };
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: GenerateStructuredRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const parsedPrompt = parsePrompt(request.prompt);
    const task = parsedPrompt["task"];
    if (typeof task === "string" && task.includes("Draft")) {
      return request.schema.parse(
        buildDeterministicDraft({
          brief: RelationshipBriefOutputSchema.parse(parsedPrompt["brief"]),
          goal: String(parsedPrompt["goal"] ?? "relationship outreach"),
          subjectName: String(parsedPrompt["subjectName"] ?? "there"),
          variant: DraftMessageOutputSchema.shape.variant.parse(parsedPrompt["variant"]),
        }),
      );
    }

    return request.schema.parse(
      buildDeterministicBrief({
        evidenceCards: z.array(EvidenceCardSchema).parse(parsedPrompt["evidenceCards"]),
        goal: String(parsedPrompt["goal"] ?? "relationship research"),
        subjectName: String(parsedPrompt["subjectName"] ?? "the subject"),
      }),
    );
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    return {
      model: this.chatModel,
      outputText: request.prompt,
      provider: "mock",
      usage: {
        inputTokens: estimateTokens(`${request.systemPrompt ?? ""}\n${request.prompt}`),
        outputTokens: estimateTokens(request.prompt),
      },
    };
  }
}

class OpenAiCompatibleGateway implements ModelGateway {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(options: SingleModelGatewayOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.chatModel = options.chatModel ?? "gpt-4.1-mini";
    this.embeddingModel = options.embeddingModel ?? "text-embedding-3-small";
  }

  async embedText(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.requestJson(
      "/embeddings",
      {
        input: request.input,
        model: this.embeddingModel,
      },
      request.timeoutMs,
    );
    const data = parseProviderPayload(
      z.object({
        data: z.array(z.object({ embedding: z.array(z.number()) })).min(1),
        model: z.string().optional(),
      }),
      response,
      "embedding",
    );
    const embedding = data.data[0]?.embedding ?? [];

    return {
      dimensions: embedding.length,
      embedding,
      model: data.model ?? this.embeddingModel,
      provider: "openai-compatible",
    };
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: GenerateStructuredRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const first = await this.generateText({
      ...request,
      prompt: `${request.prompt}\n\nReturn only JSON matching the requested schema.`,
    });
    const firstParsed = parseStructuredOutput(first.outputText, request.schema);
    if (firstParsed.ok) {
      return firstParsed.value;
    }

    const repaired = await this.generateText({
      ...request,
      prompt: [
        request.prompt,
        "",
        "The previous response was not valid JSON for the requested schema.",
        "Return only corrected JSON. Do not include prose or markdown fences.",
      ].join("\n"),
      temperature: 0,
    });
    const repairedParsed = parseStructuredOutput(repaired.outputText, request.schema);
    if (repairedParsed.ok) {
      return repairedParsed.value;
    }

    throw new AiProviderError(
      `AI provider returned invalid structured output after repair: ${repairedParsed.error.message}`,
      { cause: repairedParsed.error, kind: "malformed-output" },
    );
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    const startedAt = Date.now();
    const response = await this.requestJson(
      "/chat/completions",
      {
        messages: [
          {
            content: request.systemPrompt ?? groundedSystemPrompt(),
            role: "system",
          },
          {
            content: request.prompt,
            role: "user",
          },
        ],
        model: this.chatModel,
        temperature: request.temperature ?? 0.2,
      },
      request.timeoutMs,
    );
    const data = parseProviderPayload(
      z.object({
        choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
        model: z.string().optional(),
        usage: z
          .object({
            completion_tokens: z.number().optional(),
            prompt_tokens: z.number().optional(),
          })
          .optional(),
      }),
      response,
      "chat completion",
    );

    return {
      model: data.model ?? this.chatModel,
      outputText: data.choices[0]?.message.content ?? "",
      provider: "openai-compatible",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? estimateTokens(request.prompt),
        outputTokens:
          data.usage?.completion_tokens ??
          estimateTokens(data.choices[0]?.message.content ?? String(Date.now() - startedAt)),
      },
    };
  }

  private async requestJson(
    path: string,
    body: unknown,
    requestedTimeoutMs?: number,
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new AiProviderError(
        "OPENAI_API_KEY is required for the openai-compatible AI provider",
        { kind: "authentication" },
      );
    }

    const timeoutMs = resolveProviderTimeout(requestedTimeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw providerHttpError(response.status);
      }

      try {
        return await response.json();
      } catch (error) {
        throw new AiProviderError("AI provider returned a non-JSON response", {
          cause: error,
          kind: "malformed-output",
        });
      }
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      if (controller.signal.aborted || isAbortError(error)) {
        throw new AiProviderError(`AI provider request timed out after ${timeoutMs}ms`, {
          cause: error,
          kind: "timeout",
        });
      }
      throw new AiProviderError("AI provider request failed", {
        cause: error,
        kind: "unavailable",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function runWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!(error instanceof AiProviderError) || !isFallbackEligible(error.kind)) {
      throw error;
    }
    return fallback();
  }
}

function isFallbackEligible(kind: AiProviderFailureKind): boolean {
  return ["malformed-output", "quota", "timeout", "unavailable"].includes(kind);
}

function providerHttpError(statusCode: number): AiProviderError {
  const kind: AiProviderFailureKind =
    statusCode === 401 || statusCode === 403
      ? "authentication"
      : statusCode === 402 || statusCode === 429
        ? "quota"
        : statusCode === 408
          ? "timeout"
          : statusCode >= 500
            ? "unavailable"
            : "invalid-request";
  return new AiProviderError(`AI provider request failed with ${statusCode}`, {
    kind,
    statusCode,
  });
}

function parseProviderPayload<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  operation: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AiProviderError(`AI provider returned malformed ${operation} output`, {
      cause: parsed.error,
      kind: "malformed-output",
    });
  }
  return parsed.data;
}

function resolveProviderTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined) {
    return 30_000;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AiProviderError("AI provider timeout must be a positive number", {
      kind: "invalid-request",
    });
  }
  return timeoutMs;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function groundedSystemPrompt(): string {
  return renderPromptSystem(relationshipBriefPrompt);
}

function requiredUserInstruction(prompt: PromptDefinition, key: string): string {
  const instruction = prompt.userInstructions[key];
  if (!instruction) {
    throw new Error(`Prompt ${prompt.versionId} is missing user instruction ${key}`);
  }
  return instruction;
}

function sanitizeEvidenceCard(card: EvidenceCard): EvidenceCard {
  return {
    ...card,
    summary: card.summary.replace(/\s+/g, " ").trim().slice(0, 1000),
  };
}

function parseStructuredOutput<TSchema extends z.ZodTypeAny>(
  outputText: string,
  schema: TSchema,
): { ok: true; value: z.infer<TSchema> } | { error: Error; ok: false } {
  try {
    return {
      ok: true,
      value: schema.parse(JSON.parse(extractJsonPayload(outputText))),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error("Invalid structured output"),
      ok: false,
    };
  }
}

function extractJsonPayload(outputText: string): string {
  const trimmed = outputText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const start = [objectStart, arrayStart].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) {
    return trimmed;
  }

  const opener = trimmed[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === opener) {
      depth += 1;
    }

    if (character === closer) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return trimmed.slice(start);
}

function extractPromptInjectionEvidenceIds(warning: string): string[] {
  const match = warning.match(/prompt injection in evidence ([A-Za-z0-9_-]+)/i);
  return match?.[1] ? [match[1]] : [];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function parsePrompt(prompt: string): Record<string, unknown> {
  const parsed = JSON.parse(prompt) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Prompt payload must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

function hashText(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4));
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(Math.max(-1, Math.min(1, value)) * 1000) / 1000;
}

export * from "./prompt-registry";
