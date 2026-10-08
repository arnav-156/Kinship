import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { validationMetadatasToSchemas } from "class-validator-jsonschema";
import { getMetadataStorage } from "class-validator";

import { AppModule } from "../app.module";
import { requestBodyDtos } from "./request-body-dtos";

const httpMethods = ["delete", "get", "patch", "post", "put"] as const;

type OpenApiOperation = NonNullable<NonNullable<OpenAPIObject["paths"][string]>["get"]>;

const syntheticEnvironment: Record<string, string> = {
  DATABASE_URL: "postgresql://openapi:openapi@127.0.0.1:5432/openapi",
  JWT_ACCESS_SECRET: "openapi-document-generation-only",
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379",
  S3_ACCESS_KEY_ID: "openapi",
  S3_BUCKET: "openapi",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_SECRET_ACCESS_KEY: "openapi",
};

export async function generateOpenApiDocument(): Promise<OpenAPIObject> {
  const insertedEnvironment = Object.entries(syntheticEnvironment)
    .filter(([name]) => process.env[name] === undefined)
    .map(([name, value]) => {
      process.env[name] = value;
      return name;
    });
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });

  try {
    app.setGlobalPrefix("v1", {
      exclude: [
        { path: "/", method: RequestMethod.GET },
        { path: "health", method: RequestMethod.GET },
        { path: "ready", method: RequestMethod.GET },
        { path: "metrics", method: RequestMethod.GET },
      ],
    });
    const configuration = new DocumentBuilder()
      .setTitle("Relationship Intelligence API")
      .setDescription(
        "Authenticated relationship intelligence, evidence, privacy, and administration API.",
      )
      .setVersion("1.0.0")
      .addBearerAuth(
        {
          bearerFormat: "JWT",
          scheme: "bearer",
          type: "http",
        },
        "bearer",
      )
      .build();

    const document = SwaggerModule.createDocument(app, configuration, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey.replace(/Controller$/, "")}.${methodKey}`,
    });
    attachValidatedRequestBodies(document);
    return document;
  } finally {
    await app.close();
    for (const name of insertedEnvironment) delete process.env[name];
  }
}

function attachValidatedRequestBodies(document: OpenAPIObject): void {
  const schemas = validationMetadatasToSchemas({
    classValidatorMetadataStorage: getMetadataStorage(),
    refPointerPrefix: "#/components/schemas/",
  });
  document.components ??= {};
  document.components.schemas = {
    ...(schemas as unknown as NonNullable<OpenAPIObject["components"]>["schemas"]),
    ...document.components.schemas,
  };

  const operations = indexOperations(document);
  for (const [operationId, dto] of Object.entries(requestBodyDtos)) {
    const operation = operations.get(operationId);
    if (!operation) {
      throw new Error(`OpenAPI request-body registry references unknown operation: ${operationId}`);
    }

    const dtoName = dto.name;
    if (!schemas[dtoName]) {
      throw new Error(`OpenAPI request-body DTO has no validation schema: ${dtoName}`);
    }

    operation.requestBody = {
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${dtoName}` },
        },
      },
      required: true,
    };
  }
}

function indexOperations(document: OpenAPIObject): Map<string, OpenApiOperation> {
  const operations = new Map<string, OpenApiOperation>();
  for (const path of Object.values(document.paths)) {
    for (const method of httpMethods) {
      const operation = path?.[method];
      if (operation && "operationId" in operation && operation.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }
  return operations;
}
