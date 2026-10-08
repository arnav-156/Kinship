import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Prisma, PrismaClient } from "@relationship/db";
import { canPerformWorkspaceAction, hasMinimumWorkspaceRole } from "@relationship/policy";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type { CreateRelationshipNoteDto, UpdateRelationshipNoteDto } from "./dto";

const noteInclude = {
  author: {
    select: {
      displayName: true,
      email: true,
      id: true,
    },
  },
} satisfies Prisma.RelationshipNoteInclude;

@Injectable()
export class RelationshipNotesService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async list(principal: AuthenticatedPrincipal, workspaceId: string, entityId: string) {
    this.assertCanRead(principal, workspaceId);
    await this.requireEntity(principal, workspaceId, entityId);
    return this.prisma.relationshipNote.findMany({
      include: noteInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: {
        entityId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  async create(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
    input: CreateRelationshipNoteDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    await this.requireEntity(principal, workspaceId, entityId);
    const body = normalizeBody(input.body);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.relationshipNote.create({
        data: {
          authorId: principal.userId,
          body,
          entityId,
          tenantId: principal.tenantId,
          workspaceId,
        },
        include: noteInclude,
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "relationship_note.created",
          metadata: { entityId },
          subjectId: note.id,
          subjectType: "relationship_note",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return note;
    });
  }

  async update(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
    noteId: string,
    input: UpdateRelationshipNoteDto,
  ) {
    this.assertCanWrite(principal, workspaceId);
    const existing = await this.requireNote(principal, workspaceId, entityId, noteId);
    this.assertCanChangeNote(principal, workspaceId, existing.authorId);
    const body = normalizeBody(input.body);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.relationshipNote.update({
        data: { body },
        include: noteInclude,
        where: { id: noteId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "relationship_note.updated",
          metadata: { entityId },
          subjectId: note.id,
          subjectType: "relationship_note",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return note;
    });
  }

  async remove(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
    noteId: string,
  ) {
    this.assertCanWrite(principal, workspaceId);
    const existing = await this.requireNote(principal, workspaceId, entityId, noteId);
    this.assertCanChangeNote(principal, workspaceId, existing.authorId);

    return this.prisma.$transaction(async (tx) => {
      await tx.relationshipNote.delete({ where: { id: noteId } });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "relationship_note.deleted",
          metadata: { entityId },
          subjectId: noteId,
          subjectType: "relationship_note",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return { id: noteId, removed: true };
    });
  }

  private async requireEntity(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
  ) {
    const entity = await this.prisma.entity.findFirst({
      where: {
        deletedAt: null,
        id: entityId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
    if (!entity) {
      throw new NotFoundException("Entity was not found in this workspace");
    }
    return entity;
  }

  private async requireNote(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
    noteId: string,
  ) {
    const note = await this.prisma.relationshipNote.findFirst({
      where: {
        entityId,
        id: noteId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
    if (!note) {
      throw new NotFoundException("Relationship note was not found");
    }
    return note;
  }

  private assertCanRead(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "relationship-note:read")) {
      throw new ForbiddenException("You do not have access to relationship notes");
    }
  }

  private assertCanWrite(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "relationship-note:write")) {
      throw new ForbiddenException("You cannot change relationship notes in this workspace");
    }
  }

  private assertCanChangeNote(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    authorId: string,
  ): void {
    if (authorId === principal.userId) {
      return;
    }
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !hasMinimumWorkspaceRole(membership.role, "manager")) {
      throw new ForbiddenException("Only the note author or a manager can change this note");
    }
  }
}

function normalizeBody(value: string): string {
  const body = value.trim();
  if (!body) {
    throw new BadRequestException("Relationship note cannot be empty");
  }
  return body;
}
