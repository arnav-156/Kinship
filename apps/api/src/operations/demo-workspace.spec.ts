import { describe, expect, it, vi } from "vitest";

import { DemoWorkspaceGenerator } from "./demo-workspace";

function contentDelegates() {
  let entityNumber = 0;
  return {
    affiliation: {
      create: vi.fn().mockResolvedValue({ id: "affiliation_demo" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    entity: {
      create: vi.fn().mockImplementation(() => {
        entityNumber += 1;
        return Promise.resolve({ id: `entity_demo_${entityNumber}` });
      }),
    },
    evidenceItem: {
      create: vi.fn().mockResolvedValue({ id: "evidence_demo" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    organization: {
      create: vi.fn().mockResolvedValue({ entityId: "entity_demo_1", id: "organization_demo" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    person: {
      create: vi.fn().mockResolvedValue({ entityId: "entity_demo_2", id: "person_demo" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    prospectList: { upsert: vi.fn().mockResolvedValue({ id: "list_demo" }) },
    prospectListMember: { upsert: vi.fn().mockResolvedValue({ id: "member_demo" }) },
    relationshipNote: {
      create: vi.fn().mockResolvedValue({ id: "note_demo" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    sourceSnapshot: {
      upsert: vi.fn().mockResolvedValue({
        id: "snapshot_demo",
        rawContentHash: "sha256:kinship-guided-demo-northstar-v1",
        retrievalTimestamp: new Date("2026-07-25T10:00:00.000Z"),
        sourceIdentifier: "https://northstar-demo.invalid/team",
        sourceType: "company_website",
        sourceUrl: "https://northstar-demo.invalid/team",
      }),
    },
    workspacePolicySettings: { upsert: vi.fn().mockResolvedValue({ id: "policy_demo" }) },
  };
}

describe("demo workspace generator", () => {
  it("refuses to mix demo content into a non-demo tenant using the reserved slug", async () => {
    const transaction = vi.fn();
    const generator = new DemoWorkspaceGenerator({
      $transaction: transaction,
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant_real",
          isDemo: false,
          name: "Real Customer",
          slug: "kinship-guided-demo",
        }),
      },
    } as never);

    await expect(generator.preview({ operator: "fixture-operator" })).rejects.toThrow(
      'Reserved demo tenant slug "kinship-guided-demo" belongs to a non-demo tenant',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires exact confirmation before opening a write transaction", async () => {
    const transaction = vi.fn();
    const generator = new DemoWorkspaceGenerator({
      $transaction: transaction,
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      generator.execute(
        { operator: "fixture-operator" },
        { passwordHash: "synthetic-password-hash" },
        "GENERATE SOMETHING ELSE",
      ),
    ).rejects.toThrow(
      'Confirmation must exactly match "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo"',
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates an explicitly marked isolated tenant and workspace after confirmation", async () => {
    const tenantUpsert = vi.fn().mockResolvedValue({
      id: "tenant_demo",
      isDemo: true,
      name: "Kinship Guided Demo (Synthetic)",
      slug: "kinship-guided-demo",
    });
    const workspaceUpsert = vi.fn().mockResolvedValue({
      id: "workspace_demo",
      name: "Guided Relationship Demo (Synthetic)",
      slug: "guided-relationship-demo",
    });
    const transaction = vi.fn(async (callback) =>
      callback({
        ...contentDelegates(),
        auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_demo" }) },
        tenant: { upsert: tenantUpsert },
        user: {
          upsert: vi
            .fn()
            .mockResolvedValue({ email: "demo.owner@kinship-demo.invalid", id: "user_demo" }),
        },
        workspace: { upsert: workspaceUpsert },
        workspaceMembership: { upsert: vi.fn().mockResolvedValue({ id: "membership_demo" }) },
      }),
    );
    const generator = new DemoWorkspaceGenerator({
      $transaction: transaction,
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    const result = await generator.execute(
      { operator: "fixture-operator" },
      { passwordHash: "synthetic-password-hash" },
      "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
    );

    expect(result).toMatchObject({
      ensured: { tenant: true, workspace: true },
      scope: {
        tenantId: "tenant_demo",
        tenantSlug: "kinship-guided-demo",
        workspaceId: "workspace_demo",
        workspaceSlug: "guided-relationship-demo",
      },
    });
    expect(tenantUpsert).toHaveBeenCalledWith({
      create: {
        defaultRegion: "US",
        isDemo: true,
        name: "Kinship Guided Demo (Synthetic)",
        slug: "kinship-guided-demo",
      },
      update: {
        defaultRegion: "US",
        isDemo: true,
        name: "Kinship Guided Demo (Synthetic)",
      },
      where: { slug: "kinship-guided-demo" },
    });
    expect(workspaceUpsert).toHaveBeenCalledWith({
      create: {
        name: "Guided Relationship Demo (Synthetic)",
        slug: "guided-relationship-demo",
        tenantId: "tenant_demo",
      },
      update: {
        deletedAt: null,
        name: "Guided Relationship Demo (Synthetic)",
      },
      where: {
        tenantId_slug: {
          slug: "guided-relationship-demo",
          tenantId: "tenant_demo",
        },
      },
    });
  });

  it("creates only a synthetic owner identity and scopes its membership", async () => {
    const userUpsert = vi.fn().mockResolvedValue({
      email: "demo.owner@kinship-demo.invalid",
      id: "user_demo",
    });
    const membershipUpsert = vi.fn().mockResolvedValue({ id: "membership_demo" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_demo" });
    const transaction = vi.fn(async (callback) =>
      callback({
        ...contentDelegates(),
        auditEvent: { create: auditCreate },
        tenant: {
          upsert: vi.fn().mockResolvedValue({
            id: "tenant_demo",
            isDemo: true,
            name: "Kinship Guided Demo (Synthetic)",
            slug: "kinship-guided-demo",
          }),
        },
        user: { upsert: userUpsert },
        workspace: {
          upsert: vi.fn().mockResolvedValue({
            id: "workspace_demo",
            name: "Guided Relationship Demo (Synthetic)",
            slug: "guided-relationship-demo",
          }),
        },
        workspaceMembership: { upsert: membershipUpsert },
      }),
    );
    const generator = new DemoWorkspaceGenerator({
      $transaction: transaction,
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    const result = await generator.execute(
      { operator: "fixture-operator" },
      { passwordHash: "synthetic-password-hash" },
      "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
    );

    expect(userUpsert).toHaveBeenCalledWith({
      create: {
        displayName: "Demo Owner (Synthetic)",
        email: "demo.owner@kinship-demo.invalid",
        passwordHash: "synthetic-password-hash",
        region: "US",
        tenantId: "tenant_demo",
      },
      update: {
        deletedAt: null,
        displayName: "Demo Owner (Synthetic)",
        passwordHash: "synthetic-password-hash",
        region: "US",
        status: "active",
      },
      where: {
        tenantId_email: {
          email: "demo.owner@kinship-demo.invalid",
          tenantId: "tenant_demo",
        },
      },
    });
    expect(membershipUpsert).toHaveBeenCalledWith({
      create: {
        role: "owner",
        tenantId: "tenant_demo",
        userId: "user_demo",
        workspaceId: "workspace_demo",
      },
      update: { role: "owner" },
      where: {
        workspaceId_userId: {
          userId: "user_demo",
          workspaceId: "workspace_demo",
        },
      },
    });
    expect(result).toMatchObject({
      auditEventId: "audit_demo",
      owner: {
        email: "demo.owner@kinship-demo.invalid",
        userId: "user_demo",
      },
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("synthetic-password-hash");
  });

  it("seeds a coherent synthetic relationship story entirely inside the demo scope", async () => {
    const entityCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: "entity_org" })
      .mockResolvedValueOnce({ id: "entity_person" });
    const organizationCreate = vi.fn().mockResolvedValue({
      entityId: "entity_org",
      id: "organization_demo",
    });
    const personCreate = vi.fn().mockResolvedValue({
      entityId: "entity_person",
      id: "person_demo",
    });
    const snapshotUpsert = vi.fn().mockResolvedValue({
      id: "snapshot_demo",
      rawContentHash: "sha256:kinship-guided-demo-northstar-v1",
      retrievalTimestamp: new Date("2026-07-25T10:00:00.000Z"),
      sourceIdentifier: "https://northstar-demo.invalid/team",
      sourceType: "company_website",
      sourceUrl: "https://northstar-demo.invalid/team",
    });
    const evidenceCreate = vi.fn().mockResolvedValue({ id: "evidence_demo" });
    const listUpsert = vi.fn().mockResolvedValue({ id: "list_demo" });
    const memberUpsert = vi.fn().mockResolvedValue({ id: "member_demo" });
    const noteCreate = vi.fn().mockResolvedValue({ id: "note_demo" });
    const policyUpsert = vi.fn().mockResolvedValue({ id: "policy_demo" });
    const transaction = vi.fn(async (callback) =>
      callback({
        affiliation: {
          create: vi.fn().mockResolvedValue({ id: "affiliation_demo" }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_demo" }) },
        entity: { create: entityCreate },
        evidenceItem: {
          create: evidenceCreate,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        organization: {
          create: organizationCreate,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        person: {
          create: personCreate,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        prospectList: { upsert: listUpsert },
        prospectListMember: { upsert: memberUpsert },
        relationshipNote: {
          create: noteCreate,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        sourceSnapshot: { upsert: snapshotUpsert },
        tenant: {
          upsert: vi.fn().mockResolvedValue({
            id: "tenant_demo",
            isDemo: true,
            name: "Kinship Guided Demo (Synthetic)",
            slug: "kinship-guided-demo",
          }),
        },
        user: {
          upsert: vi.fn().mockResolvedValue({
            email: "demo.owner@kinship-demo.invalid",
            id: "user_demo",
          }),
        },
        workspace: {
          upsert: vi.fn().mockResolvedValue({
            id: "workspace_demo",
            name: "Guided Relationship Demo (Synthetic)",
            slug: "guided-relationship-demo",
          }),
        },
        workspaceMembership: { upsert: vi.fn().mockResolvedValue({ id: "membership_demo" }) },
        workspacePolicySettings: { upsert: policyUpsert },
      }),
    );
    const generator = new DemoWorkspaceGenerator(
      {
        $transaction: transaction,
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      () => new Date("2026-07-25T10:00:00.000Z"),
    );

    const result = await generator.execute(
      { operator: "fixture-operator" },
      { passwordHash: "synthetic-password-hash" },
      "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
    );

    const entityData = entityCreate.mock.calls.map((call) => call[0].data);
    expect(entityData).toEqual([
      expect.objectContaining({
        canonicalName: "Northstar Robotics (Synthetic)",
        tenantId: "tenant_demo",
        workspaceId: "workspace_demo",
      }),
      expect.objectContaining({
        canonicalName: "Maya Chen (Synthetic)",
        tenantId: "tenant_demo",
        workspaceId: "workspace_demo",
      }),
    ]);
    expect(snapshotUpsert.mock.calls[0]?.[0].create).toMatchObject({
      sourceUrl: "https://northstar-demo.invalid/team",
      tenantId: "tenant_demo",
      workspaceId: "workspace_demo",
    });
    expect(evidenceCreate.mock.calls[0]?.[0].data).toMatchObject({
      entityId: "entity_person",
      metadata: { demo: true, synthetic: true },
      tenantId: "tenant_demo",
      workspaceId: "workspace_demo",
    });
    expect(result).toMatchObject({
      content: {
        evidenceItems: 1,
        organizations: 1,
        people: 1,
        prospectLists: 1,
        relationshipNotes: 1,
      },
    });
  });

  it("reuses existing synthetic content instead of creating duplicates", async () => {
    const entityCreate = vi.fn();
    const organizationCreate = vi.fn();
    const personCreate = vi.fn();
    const affiliationCreate = vi.fn();
    const evidenceCreate = vi.fn();
    const noteCreate = vi.fn();
    const transaction = vi.fn(async (callback) =>
      callback({
        affiliation: {
          create: affiliationCreate,
          findFirst: vi.fn().mockResolvedValue({ id: "affiliation_demo" }),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_demo" }) },
        entity: { create: entityCreate },
        evidenceItem: {
          create: evidenceCreate,
          findFirst: vi.fn().mockResolvedValue({ id: "evidence_demo" }),
        },
        organization: {
          create: organizationCreate,
          findFirst: vi.fn().mockResolvedValue({
            entityId: "entity_org",
            id: "organization_demo",
          }),
        },
        person: {
          create: personCreate,
          findFirst: vi.fn().mockResolvedValue({
            entityId: "entity_person",
            id: "person_demo",
          }),
        },
        prospectList: { upsert: vi.fn().mockResolvedValue({ id: "list_demo" }) },
        prospectListMember: {
          upsert: vi.fn().mockResolvedValue({ id: "member_demo" }),
        },
        relationshipNote: {
          create: noteCreate,
          findFirst: vi.fn().mockResolvedValue({ id: "note_demo" }),
        },
        sourceSnapshot: {
          upsert: vi.fn().mockResolvedValue({
            id: "snapshot_demo",
            rawContentHash: "sha256:kinship-guided-demo-northstar-v1",
            retrievalTimestamp: new Date("2026-07-25T10:00:00.000Z"),
            sourceIdentifier: "https://northstar-demo.invalid/team",
            sourceType: "company_website",
            sourceUrl: "https://northstar-demo.invalid/team",
          }),
        },
        tenant: {
          upsert: vi.fn().mockResolvedValue({
            id: "tenant_demo",
            isDemo: true,
            name: "Kinship Guided Demo (Synthetic)",
            slug: "kinship-guided-demo",
          }),
        },
        user: {
          upsert: vi.fn().mockResolvedValue({
            email: "demo.owner@kinship-demo.invalid",
            id: "user_demo",
          }),
        },
        workspace: {
          upsert: vi.fn().mockResolvedValue({
            id: "workspace_demo",
            name: "Guided Relationship Demo (Synthetic)",
            slug: "guided-relationship-demo",
          }),
        },
        workspaceMembership: {
          upsert: vi.fn().mockResolvedValue({ id: "membership_demo" }),
        },
        workspacePolicySettings: {
          upsert: vi.fn().mockResolvedValue({ id: "policy_demo" }),
        },
      }),
    );
    const generator = new DemoWorkspaceGenerator({
      $transaction: transaction,
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant_demo",
          isDemo: true,
          name: "Kinship Guided Demo (Synthetic)",
          slug: "kinship-guided-demo",
        }),
      },
    } as never);

    await generator.execute(
      { operator: "fixture-operator" },
      { passwordHash: "synthetic-password-hash" },
      "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
    );

    expect(entityCreate).not.toHaveBeenCalled();
    expect(organizationCreate).not.toHaveBeenCalled();
    expect(personCreate).not.toHaveBeenCalled();
    expect(affiliationCreate).not.toHaveBeenCalled();
    expect(evidenceCreate).not.toHaveBeenCalled();
    expect(noteCreate).not.toHaveBeenCalled();
  });
});
