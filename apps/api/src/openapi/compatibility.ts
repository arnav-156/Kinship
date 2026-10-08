const httpMethods = ["delete", "get", "head", "options", "patch", "post", "put", "trace"] as const;

type HttpMethod = (typeof httpMethods)[number];

export interface OpenApiSchema {
  enum?: unknown[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string;
}

export interface OpenApiParameter {
  in: string;
  name: string;
  required?: boolean;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
    required?: boolean;
  };
  responses: Record<string, { description?: string }>;
  security?: Array<Record<string, string[]>>;
}

export type OpenApiPath = Partial<Record<HttpMethod, OpenApiOperation>>;

export interface OpenApiDocument {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  openapi: string;
  paths: Record<string, OpenApiPath>;
}

export interface OpenApiBreakingChange {
  code: string;
  location: string;
}

export function findOpenApiBreakingChanges(
  baseline: OpenApiDocument,
  candidate: OpenApiDocument,
): OpenApiBreakingChange[] {
  const changes: OpenApiBreakingChange[] = [];

  for (const [path, baselinePath] of Object.entries(baseline.paths)) {
    const candidatePath = candidate.paths[path];
    if (!candidatePath) {
      changes.push({ code: "path_removed", location: path });
      continue;
    }

    for (const method of httpMethods) {
      const baselineOperation = baselinePath[method];
      if (!baselineOperation) continue;
      const operationLocation = `${method.toUpperCase()} ${path}`;
      const candidateOperation = candidatePath[method];
      if (!candidateOperation) {
        changes.push({
          code: "operation_removed",
          location: operationLocation,
        });
        continue;
      }

      compareOperation(baselineOperation, candidateOperation, operationLocation, changes);
    }
  }

  compareSchemas(baseline.components?.schemas ?? {}, candidate.components?.schemas ?? {}, changes);

  return changes.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.location.localeCompare(right.location),
  );
}

function compareOperation(
  baseline: OpenApiOperation,
  candidate: OpenApiOperation,
  location: string,
  changes: OpenApiBreakingChange[],
): void {
  if (baseline.operationId && candidate.operationId !== baseline.operationId) {
    changes.push({ code: "operation_id_changed", location });
  }

  const baselineParameters = new Map(
    (baseline.parameters ?? []).map((parameter) => [parameterKey(parameter), parameter]),
  );
  const candidateParameters = new Map(
    (candidate.parameters ?? []).map((parameter) => [parameterKey(parameter), parameter]),
  );

  for (const [key, parameter] of baselineParameters) {
    const next = candidateParameters.get(key);
    if (!next) {
      changes.push({
        code: "parameter_removed",
        location: `${location} parameter ${key}`,
      });
    } else if (!parameter.required && next.required) {
      changes.push({
        code: "parameter_became_required",
        location: `${location} parameter ${key}`,
      });
    }
  }

  for (const [key, parameter] of candidateParameters) {
    if (parameter.required && !baselineParameters.has(key)) {
      changes.push({
        code: "required_parameter_added",
        location: `${location} parameter ${key}`,
      });
    }
  }

  if (candidate.requestBody?.required && !baseline.requestBody?.required) {
    changes.push({
      code: baseline.requestBody ? "request_body_became_required" : "required_request_body_added",
      location,
    });
  }

  for (const status of Object.keys(baseline.responses)) {
    if (!candidate.responses[status]) {
      changes.push({
        code: "response_removed",
        location: `${location} response ${status}`,
      });
    }
  }

  if ((baseline.security?.length ?? 0) === 0 && (candidate.security?.length ?? 0) > 0) {
    changes.push({ code: "security_requirement_added", location });
  }
}

function compareSchemas(
  baseline: Record<string, OpenApiSchema>,
  candidate: Record<string, OpenApiSchema>,
  changes: OpenApiBreakingChange[],
): void {
  for (const [name, schema] of Object.entries(baseline)) {
    const next = candidate[name];
    const location = `components.schemas.${name}`;
    if (!next) {
      changes.push({ code: "schema_removed", location });
      continue;
    }
    compareSchema(schema, next, location, changes);
  }
}

function compareSchema(
  baseline: OpenApiSchema,
  candidate: OpenApiSchema,
  location: string,
  changes: OpenApiBreakingChange[],
): void {
  if (baseline.type && candidate.type && candidate.type !== baseline.type) {
    changes.push({ code: "schema_type_changed", location });
  }

  if (
    baseline.enum &&
    candidate.enum &&
    baseline.enum.some((value) => !candidate.enum!.includes(value))
  ) {
    changes.push({ code: "enum_narrowed", location });
  }

  const baselineProperties = baseline.properties ?? {};
  const candidateProperties = candidate.properties ?? {};
  for (const [name, property] of Object.entries(baselineProperties)) {
    const next = candidateProperties[name];
    const propertyLocation = `${location}.properties.${name}`;
    if (!next) {
      changes.push({
        code: "property_removed",
        location: propertyLocation,
      });
      continue;
    }
    compareSchema(property, next, propertyLocation, changes);
  }

  const requiredBefore = new Set(baseline.required ?? []);
  for (const name of candidate.required ?? []) {
    if (!requiredBefore.has(name)) {
      changes.push({
        code: "required_property_added",
        location: `${location}.properties.${name}`,
      });
    }
  }
}

function parameterKey(parameter: OpenApiParameter): string {
  return `${parameter.in}:${parameter.name}`;
}
