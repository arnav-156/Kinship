import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://relationship:relationship@localhost:5432/relationship",
  }),
});

async function main() {
  const tenant = await prisma.tenant.upsert({
    create: {
      defaultRegion: "US",
      isDemo: false,
      name: "Local Development Tenant",
      slug: "local-dev",
    },
    update: {
      isDemo: false,
    },
    where: {
      slug: "local-dev",
    },
  });

  const workspace = await prisma.workspace.upsert({
    create: {
      name: "Relationship Intelligence",
      slug: "relationship-intelligence",
      tenantId: tenant.id,
    },
    update: {},
    where: {
      tenantId_slug: {
        slug: "relationship-intelligence",
        tenantId: tenant.id,
      },
    },
  });

  const user = await prisma.user.upsert({
    create: {
      displayName: "Local Owner",
      email: "owner@example.local",
      passwordHash: "local-development-password-hash-not-for-production",
      region: "US",
      tenantId: tenant.id,
    },
    update: {},
    where: {
      tenantId_email: {
        email: "owner@example.local",
        tenantId: tenant.id,
      },
    },
  });

  await prisma.workspaceMembership.upsert({
    create: {
      role: "owner",
      tenantId: tenant.id,
      userId: user.id,
      workspaceId: workspace.id,
    },
    update: {},
    where: {
      workspaceId_userId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
  });

  const organization =
    (await prisma.organization.findFirst({
      where: {
        domain: "example.local",
        tenantId: tenant.id,
        workspaceId: workspace.id,
      },
    })) ??
    (await prisma.$transaction(async (tx) => {
      const entity = await tx.entity.create({
        data: {
          canonicalName: "Example Research Labs",
          tenantId: tenant.id,
          type: "organization",
          workspaceId: workspace.id,
        },
      });

      return tx.organization.create({
        data: {
          domain: "example.local",
          entityId: entity.id,
          name: "Example Research Labs",
          tenantId: tenant.id,
          websiteUrl: "https://example.local",
          workspaceId: workspace.id,
        },
      });
    }));

  const existingPerson = await prisma.person.findFirst({
    where: {
      orcidId: "0000-0000-0000-0000",
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
  });

  const person =
    existingPerson ??
    (await prisma.$transaction(async (tx) => {
      const entity = await tx.entity.create({
        data: {
          canonicalName: "Dr. Ada Example",
          confidenceScore: 0.95,
          tenantId: tenant.id,
          type: "person",
          workspaceId: workspace.id,
        },
      });

      return tx.person.create({
        data: {
          entityId: entity.id,
          fullName: "Dr. Ada Example",
          orcidId: "0000-0000-0000-0000",
          tenantId: tenant.id,
          title: "Principal Researcher",
          workspaceId: workspace.id,
        },
      });
    }));

  const affiliation = await prisma.affiliation.findFirst({
    where: {
      organizationId: organization.id,
      personId: person.id,
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
  });

  if (!affiliation) {
    await prisma.affiliation.create({
      data: {
        confidenceScore: 0.9,
        organizationId: organization.id,
        personId: person.id,
        tenantId: tenant.id,
        title: "Principal Researcher",
        workspaceId: workspace.id,
      },
    });
  }

  const snapshot = await prisma.sourceSnapshot.upsert({
    create: {
      policyStatus: "allowed",
      rawContentHash: "sha256:local-dev-example",
      retrievalTimestamp: new Date(),
      sourceIdentifier: "https://example.local/research",
      sourceType: "company_website",
      sourceUrl: "https://example.local/research",
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
    update: {},
    where: {
      tenantId_workspaceId_rawContentHash: {
        rawContentHash: "sha256:local-dev-example",
        tenantId: tenant.id,
        workspaceId: workspace.id,
      },
    },
  });

  const evidence = await prisma.evidenceItem.findFirst({
    where: {
      entityId: person.entityId,
      rawContentHash: snapshot.rawContentHash,
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
  });

  if (!evidence) {
    await prisma.evidenceItem.create({
      data: {
        confidenceScore: 0.82,
        entityId: person.entityId,
        evidenceSummary:
          "Dr. Ada Example is listed as a Principal Researcher at Example Research Labs.",
        freshnessScore: 0.9,
        policyStatus: "allowed",
        rawContentHash: snapshot.rawContentHash,
        retrievalTimestamp: snapshot.retrievalTimestamp,
        sourceIdentifier: snapshot.sourceIdentifier,
        sourceSnapshotId: snapshot.id,
        sourceType: snapshot.sourceType,
        sourceUrl: snapshot.sourceUrl,
        tenantId: tenant.id,
        workspaceId: workspace.id,
      },
    });
  }

  await prisma.prospectList.upsert({
    create: {
      description: "Seeded relationship intelligence prospects.",
      name: "Seed Prospects",
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
    update: {},
    where: {
      tenantId_workspaceId_name: {
        name: "Seed Prospects",
        tenantId: tenant.id,
        workspaceId: workspace.id,
      },
    },
  });

  await prisma.retentionPolicy.upsert({
    create: {
      dataClass: "evidence",
      retentionDays: 365,
      tenantId: tenant.id,
      workspaceId: workspace.id,
    },
    update: {},
    where: {
      tenantId_workspaceId_dataClass: {
        dataClass: "evidence",
        tenantId: tenant.id,
        workspaceId: workspace.id,
      },
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
