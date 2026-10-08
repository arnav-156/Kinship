import type { Prisma, PrismaClient } from "@relationship/db";

export const DEMO_TENANT_SLUG = "kinship-guided-demo";
export const DEMO_WORKSPACE_SLUG = "guided-relationship-demo";

export interface DemoWorkspaceTarget {
  operator: string;
}

export interface DemoWorkspaceInput {
  passwordHash: string;
}

interface ExistingDemoTenant {
  id: string;
  isDemo: boolean;
  name: string;
  slug: string;
}

export class DemoWorkspaceGenerator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async preview(target: DemoWorkspaceTarget) {
    const tenant = (await this.prisma.tenant.findUnique({
      select: { id: true, isDemo: true, name: true, slug: true },
      where: { slug: DEMO_TENANT_SLUG },
    })) as ExistingDemoTenant | null;
    if (tenant && !tenant.isDemo) {
      throw new Error(
        `Reserved demo tenant slug "${DEMO_TENANT_SLUG}" belongs to a non-demo tenant`,
      );
    }

    return {
      confirmation: `GENERATE ISOLATED DEMO WORKSPACE ${DEMO_TENANT_SLUG}/${DEMO_WORKSPACE_SLUG}`,
      existingDemoTenantId: tenant?.id ?? null,
      operator: target.operator,
      reservedScope: {
        tenantSlug: DEMO_TENANT_SLUG,
        workspaceSlug: DEMO_WORKSPACE_SLUG,
      },
      syntheticIdentityDomain: "kinship-demo.invalid",
    };
  }

  async execute(target: DemoWorkspaceTarget, input: DemoWorkspaceInput, confirmation: string) {
    const plan = await this.preview(target);
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        create: {
          defaultRegion: "US",
          isDemo: true,
          name: "Kinship Guided Demo (Synthetic)",
          slug: DEMO_TENANT_SLUG,
        },
        update: {
          defaultRegion: "US",
          isDemo: true,
          name: "Kinship Guided Demo (Synthetic)",
        },
        where: { slug: DEMO_TENANT_SLUG },
      });
      const workspace = await tx.workspace.upsert({
        create: {
          name: "Guided Relationship Demo (Synthetic)",
          slug: DEMO_WORKSPACE_SLUG,
          tenantId: tenant.id,
        },
        update: {
          deletedAt: null,
          name: "Guided Relationship Demo (Synthetic)",
        },
        where: {
          tenantId_slug: {
            slug: DEMO_WORKSPACE_SLUG,
            tenantId: tenant.id,
          },
        },
      });
      const user = await tx.user.upsert({
        create: {
          displayName: "Demo Owner (Synthetic)",
          email: "demo.owner@kinship-demo.invalid",
          passwordHash: input.passwordHash,
          region: "US",
          tenantId: tenant.id,
        },
        update: {
          deletedAt: null,
          displayName: "Demo Owner (Synthetic)",
          passwordHash: input.passwordHash,
          region: "US",
          status: "active",
        },
        where: {
          tenantId_email: {
            email: "demo.owner@kinship-demo.invalid",
            tenantId: tenant.id,
          },
        },
      });
      await tx.workspaceMembership.upsert({
        create: {
          role: "owner",
          tenantId: tenant.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
        update: { role: "owner" },
        where: {
          workspaceId_userId: {
            userId: user.id,
            workspaceId: workspace.id,
          },
        },
      });
      const content = await ensureGuidedContent(
        tx,
        { tenantId: tenant.id, userId: user.id, workspaceId: workspace.id },
        this.now(),
      );

      const auditEvent = await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          eventType: "demo_workspace.generated",
          metadata: {
            generatorVersion: "1.0",
            operator: target.operator,
            synthetic: true,
          },
          subjectId: workspace.id,
          subjectType: "workspace",
          tenantId: tenant.id,
          workspaceId: workspace.id,
        },
        select: { id: true },
      });

      return {
        auditEventId: auditEvent.id,
        content,
        ensured: { membership: true, owner: true, tenant: true, workspace: true },
        owner: {
          email: user.email,
          userId: user.id,
        },
        scope: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
        },
      };
    });
  }
}

interface DemoScope {
  tenantId: string;
  userId: string;
  workspaceId: string;
}

async function ensureGuidedContent(
  tx: Prisma.TransactionClient,
  scope: DemoScope,
  generatedAt: Date,
) {
  let organization = await tx.organization.findFirst({
    where: {
      domain: "northstar-demo.invalid",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!organization) {
    const entity = await tx.entity.create({
      data: {
        canonicalName: "Northstar Robotics (Synthetic)",
        confidenceScore: 1,
        description: "Synthetic organization created exclusively for the guided demo.",
        tenantId: scope.tenantId,
        type: "organization",
        workspaceId: scope.workspaceId,
      },
    });
    organization = await tx.organization.create({
      data: {
        domain: "northstar-demo.invalid",
        entityId: entity.id,
        industry: "Synthetic robotics research",
        location: "Demo City",
        name: "Northstar Robotics (Synthetic)",
        tenantId: scope.tenantId,
        websiteUrl: "https://northstar-demo.invalid",
        workspaceId: scope.workspaceId,
      },
    });
  }

  let person = await tx.person.findFirst({
    where: {
      githubLogin: "maya-chen-synthetic-demo",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!person) {
    const entity = await tx.entity.create({
      data: {
        canonicalName: "Maya Chen (Synthetic)",
        confidenceScore: 1,
        description: "Synthetic relationship subject created exclusively for the guided demo.",
        tenantId: scope.tenantId,
        type: "person",
        workspaceId: scope.workspaceId,
      },
    });
    person = await tx.person.create({
      data: {
        entityId: entity.id,
        fullName: "Maya Chen (Synthetic)",
        githubLogin: "maya-chen-synthetic-demo",
        location: "Demo City",
        tenantId: scope.tenantId,
        title: "VP, Research Partnerships (Synthetic)",
        workspaceId: scope.workspaceId,
      },
    });
  }

  const affiliation = await tx.affiliation.findFirst({
    where: {
      organizationId: organization.id,
      personId: person.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!affiliation) {
    await tx.affiliation.create({
      data: {
        confidenceScore: 1,
        organizationId: organization.id,
        personId: person.id,
        tenantId: scope.tenantId,
        title: "VP, Research Partnerships (Synthetic)",
        workspaceId: scope.workspaceId,
      },
    });
  }

  const snapshot = await tx.sourceSnapshot.upsert({
    create: {
      contentType: "text/html",
      policyStatus: "allowed",
      rawContentHash: "sha256:kinship-guided-demo-northstar-v1",
      retrievalTimestamp: generatedAt,
      sourceIdentifier: "https://northstar-demo.invalid/team",
      sourceType: "company_website",
      sourceUrl: "https://northstar-demo.invalid/team",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
    update: {
      policyStatus: "allowed",
      retrievalTimestamp: generatedAt,
    },
    where: {
      tenantId_workspaceId_rawContentHash: {
        rawContentHash: "sha256:kinship-guided-demo-northstar-v1",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
    },
  });
  const existingEvidence = await tx.evidenceItem.findFirst({
    where: {
      entityId: person.entityId,
      rawContentHash: snapshot.rawContentHash,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!existingEvidence) {
    await tx.evidenceItem.create({
      data: {
        confidenceScore: 1,
        entityId: person.entityId,
        evidenceSummary:
          "Synthetic evidence: Maya Chen leads research partnerships at Northstar Robotics.",
        freshnessScore: 1,
        metadata: { demo: true, synthetic: true },
        policyStatus: "allowed",
        rawContentHash: snapshot.rawContentHash,
        retrievalTimestamp: snapshot.retrievalTimestamp,
        sourceIdentifier: snapshot.sourceIdentifier,
        sourceSnapshotId: snapshot.id,
        sourceType: snapshot.sourceType,
        sourceUrl: snapshot.sourceUrl,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
    });
  }

  const prospectList = await tx.prospectList.upsert({
    create: {
      createdById: scope.userId,
      description: "Synthetic prospects for the isolated guided demo.",
      name: "Guided Demo Prospects (Synthetic)",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
    update: {
      createdById: scope.userId,
      deletedAt: null,
      description: "Synthetic prospects for the isolated guided demo.",
    },
    where: {
      tenantId_workspaceId_name: {
        name: "Guided Demo Prospects (Synthetic)",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
    },
  });
  await tx.prospectListMember.upsert({
    create: {
      confidenceScore: 1,
      entityId: person.entityId,
      fitScore: 0.92,
      notes: "Synthetic high-fit partnership prospect.",
      prospectListId: prospectList.id,
      relationshipStage: "warm",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
    update: {
      confidenceScore: 1,
      fitScore: 0.92,
      notes: "Synthetic high-fit partnership prospect.",
      relationshipStage: "warm",
    },
    where: {
      prospectListId_entityId: {
        entityId: person.entityId,
        prospectListId: prospectList.id,
      },
    },
  });

  const noteBody =
    "Synthetic demo note: met at the fictional Applied Systems Forum; follow up about a research partnership.";
  const existingNote = await tx.relationshipNote.findFirst({
    where: {
      authorId: scope.userId,
      body: noteBody,
      entityId: person.entityId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!existingNote) {
    await tx.relationshipNote.create({
      data: {
        authorId: scope.userId,
        body: noteBody,
        entityId: person.entityId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
    });
  }

  await tx.workspacePolicySettings.upsert({
    create: {
      defaultConsentStatus: "unknown",
      defaultPurpose: "relationship_intelligence",
      defaultRecipientRegion: "US",
      defaultRecipientType: "professional",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    },
    update: {
      defaultConsentStatus: "unknown",
      defaultPurpose: "relationship_intelligence",
      defaultRecipientRegion: "US",
      defaultRecipientType: "professional",
    },
    where: { workspaceId: scope.workspaceId },
  });

  return {
    evidenceItems: 1,
    organizations: 1,
    people: 1,
    prospectLists: 1,
    relationshipNotes: 1,
  };
}
