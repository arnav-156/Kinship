import { describe, expect, it } from "vitest";

import { generateOpenApiDocument } from "./document";

const httpMethods = ["delete", "get", "patch", "post", "put"] as const;

describe("OpenAPI document generation", () => {
  it("describes the live controller surface without starting a listener", async () => {
    const document = await generateOpenApiDocument();
    const operationCount = Object.values(document.paths).reduce(
      (total, path) =>
        total +
        Object.keys(path ?? {}).filter((key) =>
          httpMethods.includes(key as (typeof httpMethods)[number]),
        ).length,
      0,
    );
    const requestBodyCount = Object.values(document.paths).reduce(
      (total, path) => total + httpMethods.filter((method) => path?.[method]?.requestBody).length,
      0,
    );

    expect(document.openapi).toMatch(/^3\./);
    expect(operationCount).toBeGreaterThanOrEqual(75);
    expect(requestBodyCount).toBe(37);
    expect(Object.keys(document.components?.schemas ?? {})).toHaveLength(36);
    expect(document.paths).toMatchObject({
      "/v1/analyze-url": { post: {} },
      "/v1/relationship-briefs": { post: {} },
      "/v1/search/evidence": { post: {} },
      "/v1/workspaces/{id}": { get: {} },
    });
    expect(document.components?.securitySchemes).toHaveProperty("bearer");
    expect(Object.keys(document.components?.schemas ?? {})).toContain("SearchEvidenceDto");
    expect(document.paths["/v1/search/evidence"]?.post?.requestBody).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/SearchEvidenceDto" },
        },
      },
      required: true,
    });
    expect(document.components?.schemas?.SearchEvidenceDto).toMatchObject({
      properties: {
        query: { type: "string" },
        workspaceId: { type: "string" },
      },
      required: expect.arrayContaining(["query", "workspaceId"]),
      type: "object",
    });
  });
});
