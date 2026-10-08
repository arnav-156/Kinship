import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Prisma, PrismaClient, SourceType } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import {
  buildRetrievalContext,
  lexicalMatchScore,
  rankEvidenceCandidates,
  resolveEntityCandidates,
  type EntityResolutionCandidate,
  type EntityResolutionInput,
  type EvidenceSearchResult,
} from "@relationship/search";

import { PRISMA_CLIENT } from "../database/prisma.token";
import type { SearchEvidenceDto, SearchProspectsDto, SearchSimilarPeopleDto } from "./dto";

@Injectable()
export class SearchService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async searchEvidence(principal: AuthenticatedPrincipal, input: SearchEvidenceDto) {
    this.assertCanReadWorkspace(principal, input.workspaceId);
    const evidence = await this.prisma.evidenceItem.findMany({
      include: {
        entity: true,
      },
      orderBy: {
        retrievalTimestamp: "desc",
      },
      take: expandedLimit(input.limit),
      where: this.buildEvidenceWhere(principal, input),
    });

    const results = rankEvidenceCandidates(
      evidence.map((item) => {
        const searchableText = [
          item.evidenceSummary,
          item.sourceIdentifier,
          item.sourceUrl,
          item.entity.canonicalName,
          item.entity.description,
        ]
          .filter(Boolean)
          .join(" ");

        return {
          confidenceScore: item.confidenceScore,
          entityId: item.entityId,
          evidenceId: item.id,
          evidenceSummary: item.evidenceSummary,
          freshnessScore: item.freshnessScore,
          lexicalScore: lexicalMatchScore(input.query, searchableText),
          metadataScore: metadataMatchScore(input.query, item.sourceIdentifier, item.sourceUrl),
          retrievalTimestamp: item.retrievalTimestamp,
          sourceType: item.sourceType,
        };
      }),
    ).slice(0, input.limit ?? 20);

    return {
      context: buildRetrievalContext(results),
      results,
    };
  }

  async searchProspects(principal: AuthenticatedPrincipal, input: SearchProspectsDto) {
    const evidenceSearch = await this.searchEvidence(principal, input);
    const byEntity = new Map<
      string,
      {
        evidence: EvidenceSearchResult[];
        rankScore: number;
      }
    >();

    for (const result of evidenceSearch.results) {
      if (!result.entityId) {
        continue;
      }

      const existing = byEntity.get(result.entityId) ?? { evidence: [], rankScore: 0 };
      existing.evidence.push(result);
      existing.rankScore = Math.max(existing.rankScore, result.rankScore);
      byEntity.set(result.entityId, existing);
    }

    const entityIds = [...byEntity.keys()];
    const entities = await this.prisma.entity.findMany({
      include: {
        organization: true,
        person: true,
      },
      where: {
        deletedAt: null,
        id: {
          in: entityIds,
        },
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
    });

    return entities
      .map((entity) => {
        const grouped = byEntity.get(entity.id);
        const evidence = grouped?.evidence ?? [];
        const evidenceBoost = Math.min(0.25, evidence.length * 0.04);
        const fitScore = roundScore((grouped?.rankScore ?? 0) + evidenceBoost);

        return {
          entity: {
            canonicalName: entity.canonicalName,
            id: entity.id,
            type: entity.type,
          },
          evidence: evidence.slice(0, 5),
          fitScore,
          prospectType: entity.person ? "person" : entity.organization ? "organization" : "entity",
        };
      })
      .sort((left, right) => right.fitScore - left.fitScore)
      .slice(0, input.limit ?? 20);
  }

  async searchSimilarPeople(principal: AuthenticatedPrincipal, input: SearchSimilarPeopleDto) {
    this.assertCanReadWorkspace(principal, input.workspaceId);
    const seed = input.entityId
      ? await this.prisma.entity.findFirst({
          include: {
            aliases: true,
            person: true,
          },
          where: {
            deletedAt: null,
            id: input.entityId,
            tenantId: principal.tenantId,
            workspaceId: input.workspaceId,
          },
        })
      : null;

    if (input.entityId && !seed) {
      throw new NotFoundException("Seed entity was not found in this workspace");
    }

    const resolutionInput = this.buildResolutionInput(input, seed);
    const entities = await this.prisma.entity.findMany({
      include: {
        aliases: true,
        person: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 200,
      where: {
        deletedAt: null,
        id: input.entityId
          ? {
              not: input.entityId,
            }
          : undefined,
        tenantId: principal.tenantId,
        type: "person",
        workspaceId: input.workspaceId,
      },
    });

    return resolveEntityCandidates(
      resolutionInput,
      entities.map((entity) => toResolutionCandidate(entity)),
    )
      .filter((result) => result.score >= 0.18)
      .slice(0, input.limit ?? 20);
  }

  private buildEvidenceWhere(
    principal: AuthenticatedPrincipal,
    input: SearchEvidenceDto,
  ): Prisma.EvidenceItemWhereInput {
    const query = input.query.trim();
    const textSearch =
      query.length > 0
        ? [
            {
              evidenceSummary: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              sourceIdentifier: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              sourceUrl: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              entity: {
                canonicalName: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          ]
        : undefined;

    return {
      OR: textSearch,
      sourceType: input.sourceTypes
        ? {
            in: input.sourceTypes as SourceType[],
          }
        : undefined,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    };
  }

  private buildResolutionInput(
    input: SearchSimilarPeopleDto,
    seed:
      | (Awaited<ReturnType<PrismaClient["entity"]["findFirst"]>> & {
          aliases?: { alias: string }[];
          person?: {
            fullName: string;
            githubLogin: string | null;
            linkedinUrl: string | null;
            location: string | null;
            orcidId: string | null;
            primaryEmailHash: string | null;
          } | null;
        })
      | null,
  ): EntityResolutionInput {
    return {
      employerName: input.employerName,
      fullName: input.fullName ?? seed?.person?.fullName ?? seed?.canonicalName,
      githubLogin: input.githubLogin ?? seed?.person?.githubLogin ?? undefined,
      linkedinUrl: input.linkedinUrl ?? seed?.person?.linkedinUrl ?? undefined,
      location: input.location ?? seed?.person?.location ?? undefined,
      orcidId: input.orcidId ?? seed?.person?.orcidId ?? undefined,
      primaryEmailHash: input.primaryEmailHash ?? seed?.person?.primaryEmailHash ?? undefined,
      profileUrls: [input.linkedinUrl, seed?.person?.linkedinUrl].filter((value): value is string =>
        Boolean(value),
      ),
    };
  }

  private assertCanReadWorkspace(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:read")) {
      throw new ForbiddenException("You do not have access to this workspace");
    }
  }
}

function toResolutionCandidate(entity: {
  aliases: { alias: string }[];
  canonicalName: string;
  id: string;
  person: {
    fullName: string;
    githubLogin: string | null;
    linkedinUrl: string | null;
    location: string | null;
    orcidId: string | null;
    primaryEmailHash: string | null;
  } | null;
  type: string;
}): EntityResolutionCandidate {
  return {
    aliases: [entity.person?.fullName, ...entity.aliases.map((alias) => alias.alias)].filter(
      (value): value is string => Boolean(value),
    ),
    canonicalName: entity.canonicalName,
    entityId: entity.id,
    githubLogin: entity.person?.githubLogin,
    linkedinUrl: entity.person?.linkedinUrl,
    location: entity.person?.location,
    orcidId: entity.person?.orcidId,
    primaryEmailHash: entity.person?.primaryEmailHash,
    type: "person",
  };
}

function metadataMatchScore(query: string, ...values: Array<string | null>): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedQuery)) ? 0.8 : 0;
}

function expandedLimit(limit = 20): number {
  return Math.min(200, Math.max(20, limit * 4));
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
