import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Prisma, PrismaClient, RelationshipStage } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import { parseProspectCsv, type ProspectImportRow } from "./csv-import";
import type {
  CreateProspectListDto,
  CreateProspectListMemberDto,
  ImportProspectListDto,
  UpdateProspectListDto,
  UpdateProspectListMemberDto,
} from "./dto";

const memberInclude = {
  entity: {
    include: {
      organization: true,
      person: true,
    },
  },
} satisfies Prisma.ProspectListMemberInclude;

@Injectable()
export class ProspectListsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    input: CreateProspectListDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await this.assertUniqueName(principal, workspaceId, input.name);

    return this.prisma.$transaction(async (tx) => {
      const list = await tx.prospectList.create({
        data: {
          createdById: principal.userId,
          description: cleanOptional(input.description),
          name: input.name.trim(),
          tenantId: principal.tenantId,
          workspaceId,
        },
        include: {
          _count: {
            select: { members: true },
          },
        },
      });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.created",
        list.id,
        { name: list.name },
        tx,
      );
      return list;
    });
  }

  list(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanRead(principal, workspaceId);
    return this.prisma.prospectList.findMany({
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      where: {
        deletedAt: null,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  async get(principal: AuthenticatedPrincipal, workspaceId: string, listId: string) {
    this.assertCanRead(principal, workspaceId);
    const list = await this.prisma.prospectList.findFirst({
      include: {
        members: {
          include: memberInclude,
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        },
      },
      where: this.listWhere(principal, workspaceId, listId),
    });
    if (!list) {
      throw new NotFoundException("Prospect list was not found");
    }

    return list;
  }

  async update(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    input: UpdateProspectListDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    const existing = await this.requireList(principal, workspaceId, listId);
    if (input.name === undefined && input.description === undefined) {
      throw new BadRequestException("At least one prospect-list field is required");
    }
    if (input.name && input.name.trim() !== existing.name) {
      await this.assertUniqueName(principal, workspaceId, input.name, listId);
    }

    return this.prisma.$transaction(async (tx) => {
      const list = await tx.prospectList.update({
        data: {
          description:
            input.description === undefined ? undefined : cleanOptional(input.description),
          name: input.name?.trim(),
        },
        include: {
          _count: {
            select: { members: true },
          },
        },
        where: { id: listId },
      });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.updated",
        list.id,
        { name: list.name },
        tx,
      );
      return list;
    });
  }

  async archive(principal: AuthenticatedPrincipal, workspaceId: string, listId: string) {
    this.assertCanWrite(principal, workspaceId);
    await this.requireList(principal, workspaceId, listId);
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.prospectList.update({
        data: { deletedAt: new Date() },
        where: { id: listId },
      });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.archived",
        list.id,
        undefined,
        tx,
      );
      return list;
    });
  }

  async addMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    input: CreateProspectListMemberDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await Promise.all([
      this.requireList(principal, workspaceId, listId),
      this.requireEntity(principal, workspaceId, input.entityId),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.prospectListMember.upsert({
        create: {
          confidenceScore: input.confidenceScore,
          entityId: input.entityId,
          fitScore: input.fitScore,
          notes: cleanOptional(input.notes),
          prospectListId: listId,
          relationshipStage: (input.relationshipStage ?? "prospect") as RelationshipStage,
          tenantId: principal.tenantId,
          workspaceId,
        },
        include: memberInclude,
        update: {
          confidenceScore: input.confidenceScore,
          fitScore: input.fitScore,
          notes: cleanOptional(input.notes),
          relationshipStage: (input.relationshipStage ?? "prospect") as RelationshipStage,
        },
        where: {
          prospectListId_entityId: {
            entityId: input.entityId,
            prospectListId: listId,
          },
        },
      });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.member_upserted",
        member.id,
        { entityId: input.entityId, prospectListId: listId },
        tx,
        "prospect_list_member",
      );
      return member;
    });
  }

  async updateMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    memberId: string,
    input: UpdateProspectListMemberDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await this.requireMember(principal, workspaceId, listId, memberId);
    if (
      input.relationshipStage === undefined &&
      input.fitScore === undefined &&
      input.confidenceScore === undefined &&
      input.notes === undefined
    ) {
      throw new BadRequestException("At least one prospect-list member field is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.prospectListMember.update({
        data: {
          confidenceScore: input.confidenceScore,
          fitScore: input.fitScore,
          notes: input.notes === undefined ? undefined : cleanOptional(input.notes),
          relationshipStage: input.relationshipStage as RelationshipStage | undefined,
        },
        include: memberInclude,
        where: { id: memberId },
      });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.member_updated",
        member.id,
        { prospectListId: listId },
        tx,
        "prospect_list_member",
      );
      return member;
    });
  }

  async removeMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    memberId: string,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await this.requireMember(principal, workspaceId, listId, memberId);
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.prospectListMember.delete({ where: { id: memberId } });
      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.member_removed",
        member.id,
        { entityId: member.entityId, prospectListId: listId },
        tx,
        "prospect_list_member",
      );
      return member;
    });
  }

  async importCsv(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    input: ImportProspectListDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await this.requireList(principal, workspaceId, listId);

    let parsed: ReturnType<typeof parseProspectCsv>;
    try {
      parsed = parseProspectCsv(input.csvText);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "CSV could not be parsed",
      );
    }
    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        errors: parsed.errors,
        message: "CSV validation failed",
      });
    }
    if (parsed.rows.length > 5000) {
      throw new BadRequestException("CSV import is limited to 5,000 prospects per request");
    }

    return this.prisma.$transaction(async (tx) => {
      let createdEntities = 0;
      let addedMembers = 0;
      let updatedMembers = 0;
      const importedMemberIds: string[] = [];

      for (const row of parsed.rows) {
        const resolved = await this.resolveOrCreateImportedEntity(tx, principal, workspaceId, row);
        if (resolved.created) {
          createdEntities += 1;
        }

        const existing = await tx.prospectListMember.findUnique({
          where: {
            prospectListId_entityId: {
              entityId: resolved.entityId,
              prospectListId: listId,
            },
          },
        });
        const member = await tx.prospectListMember.upsert({
          create: {
            confidenceScore: row.confidenceScore,
            entityId: resolved.entityId,
            fitScore: row.fitScore,
            notes: row.notes,
            prospectListId: listId,
            relationshipStage: row.relationshipStage as RelationshipStage,
            tenantId: principal.tenantId,
            workspaceId,
          },
          update: {
            confidenceScore: row.confidenceScore,
            fitScore: row.fitScore,
            notes: row.notes,
            relationshipStage: row.relationshipStage as RelationshipStage,
          },
          where: {
            prospectListId_entityId: {
              entityId: resolved.entityId,
              prospectListId: listId,
            },
          },
        });
        importedMemberIds.push(member.id);
        if (existing) {
          updatedMembers += 1;
        } else {
          addedMembers += 1;
        }
      }

      await this.recordAudit(
        principal,
        workspaceId,
        "prospect_list.imported",
        listId,
        {
          addedMembers,
          createdEntities,
          rowCount: parsed.rows.length,
          sourceName: input.sourceName,
          updatedMembers,
        },
        tx,
      );
      return {
        addedMembers,
        createdEntities,
        importedMemberIds,
        rowCount: parsed.rows.length,
        updatedMembers,
      };
    });
  }

  private async resolveOrCreateImportedEntity(
    tx: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    row: ProspectImportRow,
  ): Promise<{ created: boolean; entityId: string }> {
    if (row.entityId) {
      const entity = await tx.entity.findFirst({
        where: this.entityWhere(principal, workspaceId, row.entityId),
      });
      if (!entity) {
        throw new BadRequestException(
          `Row ${row.rowNumber}: entity_id was not found in this workspace`,
        );
      }
      return { created: false, entityId: entity.id };
    }

    if (row.type === "person") {
      const identifiers: Prisma.PersonWhereInput[] = [];
      if (row.email) identifiers.push({ primaryEmailHash: hashEmail(row.email) });
      if (row.orcidId) identifiers.push({ orcidId: row.orcidId });
      if (row.githubLogin) identifiers.push({ githubLogin: row.githubLogin });
      if (row.linkedinUrl) identifiers.push({ linkedinUrl: row.linkedinUrl });
      if (identifiers.length > 0) {
        const person = await tx.person.findFirst({
          where: {
            OR: identifiers,
            tenantId: principal.tenantId,
            workspaceId,
          },
        });
        if (person) {
          return { created: false, entityId: person.entityId };
        }
      }
    } else if (row.domain) {
      const organization = await tx.organization.findFirst({
        where: {
          domain: normalizeDomain(row.domain),
          tenantId: principal.tenantId,
          workspaceId,
        },
      });
      if (organization) {
        return { created: false, entityId: organization.entityId };
      }
    }

    const entity = await tx.entity.create({
      data: {
        canonicalName: row.name,
        confidenceScore: row.confidenceScore ?? 0.7,
        organization:
          row.type === "organization"
            ? {
                create: {
                  domain: row.domain ? normalizeDomain(row.domain) : undefined,
                  location: row.location,
                  name: row.name,
                  tenantId: principal.tenantId,
                  websiteUrl: row.websiteUrl,
                  workspaceId,
                },
              }
            : undefined,
        person:
          row.type === "person"
            ? {
                create: {
                  fullName: row.name,
                  githubLogin: row.githubLogin,
                  linkedinUrl: row.linkedinUrl,
                  location: row.location,
                  orcidId: row.orcidId,
                  primaryEmailHash: row.email ? hashEmail(row.email) : undefined,
                  tenantId: principal.tenantId,
                  title: row.title,
                  workspaceId,
                },
              }
            : undefined,
        tenantId: principal.tenantId,
        type: row.type,
        workspaceId,
      },
    });
    return { created: true, entityId: entity.id };
  }

  private async requireList(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
  ) {
    const list = await this.prisma.prospectList.findFirst({
      where: this.listWhere(principal, workspaceId, listId),
    });
    if (!list) {
      throw new NotFoundException("Prospect list was not found");
    }
    return list;
  }

  private async requireEntity(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
  ) {
    const entity = await this.prisma.entity.findFirst({
      where: this.entityWhere(principal, workspaceId, entityId),
    });
    if (!entity) {
      throw new NotFoundException("Entity was not found in this workspace");
    }
    return entity;
  }

  private async requireMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    listId: string,
    memberId: string,
  ) {
    const member = await this.prisma.prospectListMember.findFirst({
      where: {
        id: memberId,
        prospectListId: listId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
    if (!member) {
      throw new NotFoundException("Prospect list member was not found");
    }
    return member;
  }

  private async assertUniqueName(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.prospectList.findFirst({
      where: {
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
        name: { equals: name.trim(), mode: "insensitive" },
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
    if (existing) {
      throw new ConflictException("A prospect list with this name already exists");
    }
  }

  private listWhere(principal: AuthenticatedPrincipal, workspaceId: string, listId: string) {
    return {
      deletedAt: null,
      id: listId,
      tenantId: principal.tenantId,
      workspaceId,
    };
  }

  private entityWhere(principal: AuthenticatedPrincipal, workspaceId: string, entityId: string) {
    return {
      deletedAt: null,
      id: entityId,
      tenantId: principal.tenantId,
      workspaceId,
    };
  }

  private assertCanRead(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "prospect-list:read")) {
      throw new ForbiddenException("You do not have access to prospect lists in this workspace");
    }
  }

  private assertCanWrite(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "prospect-list:write")) {
      throw new ForbiddenException("You cannot change prospect lists in this workspace");
    }
  }

  private recordAudit(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    eventType: string,
    subjectId: string,
    metadata: Prisma.InputJsonValue | undefined,
    tx: Prisma.TransactionClient,
    subjectType = "prospect_list",
  ) {
    return this.auditService.record(
      {
        actorUserId: principal.userId,
        eventType,
        metadata,
        subjectId,
        subjectType,
        tenantId: principal.tenantId,
        workspaceId,
      },
      tx,
    );
  }
}

function cleanOptional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function hashEmail(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}
