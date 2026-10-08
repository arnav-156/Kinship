import { describe, expect, it } from "vitest";

import { findOpenApiBreakingChanges, type OpenApiDocument } from "./compatibility";

const baseline: OpenApiDocument = {
  components: {
    schemas: {
      Workspace: {
        properties: {
          id: { type: "string" },
          role: { enum: ["owner", "member"], type: "string" },
        },
        required: ["id"],
        type: "object",
      },
    },
  },
  openapi: "3.0.3",
  paths: {
    "/v1/workspaces/{workspaceId}": {
      get: {
        operationId: "getWorkspace",
        parameters: [
          {
            in: "path",
            name: "workspaceId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Workspace" } },
      },
    },
  },
};

describe("OpenAPI compatibility", () => {
  it("accepts additive operations, optional inputs, properties, and enum values", () => {
    const candidate: OpenApiDocument = structuredClone(baseline);
    candidate.paths["/v1/workspaces"] = {
      get: {
        operationId: "listWorkspaces",
        responses: { "200": { description: "Workspaces" } },
      },
    };
    candidate.paths["/v1/workspaces/{workspaceId}"]!.get!.parameters!.push({
      in: "query",
      name: "include",
      required: false,
      schema: { type: "string" },
    });
    const schema = candidate.components!.schemas!.Workspace!;
    schema.properties!.name = { type: "string" };
    schema.properties!.role!.enum!.push("viewer");

    expect(findOpenApiBreakingChanges(baseline, candidate)).toEqual([]);
  });

  it("detects removed operations and changed operation IDs", () => {
    const removed: OpenApiDocument = structuredClone(baseline);
    delete removed.paths["/v1/workspaces/{workspaceId}"]!.get;

    expect(findOpenApiBreakingChanges(baseline, removed)).toEqual([
      {
        code: "operation_removed",
        location: "GET /v1/workspaces/{workspaceId}",
      },
    ]);

    const renamed: OpenApiDocument = structuredClone(baseline);
    renamed.paths["/v1/workspaces/{workspaceId}"]!.get!.operationId = "fetchWorkspace";
    expect(findOpenApiBreakingChanges(baseline, renamed)).toEqual([
      {
        code: "operation_id_changed",
        location: "GET /v1/workspaces/{workspaceId}",
      },
    ]);
  });

  it("detects newly required parameters and request bodies", () => {
    const candidate: OpenApiDocument = structuredClone(baseline);
    const operation = candidate.paths["/v1/workspaces/{workspaceId}"]!.get!;
    operation.parameters!.push({
      in: "query",
      name: "tenant",
      required: true,
      schema: { type: "string" },
    });
    operation.requestBody = {
      content: { "application/json": { schema: { type: "object" } } },
      required: true,
    };

    expect(findOpenApiBreakingChanges(baseline, candidate)).toEqual([
      {
        code: "required_parameter_added",
        location: "GET /v1/workspaces/{workspaceId} parameter query:tenant",
      },
      {
        code: "required_request_body_added",
        location: "GET /v1/workspaces/{workspaceId}",
      },
    ]);
  });

  it("detects removed properties, new required properties, and narrowed enums", () => {
    const candidate: OpenApiDocument = structuredClone(baseline);
    const schema = candidate.components!.schemas!.Workspace!;
    delete schema.properties!.id;
    schema.properties!.email = { type: "string" };
    schema.required = ["email"];
    schema.properties!.role!.enum = ["owner"];

    expect(findOpenApiBreakingChanges(baseline, candidate)).toEqual([
      {
        code: "enum_narrowed",
        location: "components.schemas.Workspace.properties.role",
      },
      {
        code: "property_removed",
        location: "components.schemas.Workspace.properties.id",
      },
      {
        code: "required_property_added",
        location: "components.schemas.Workspace.properties.email",
      },
    ]);
  });
});
