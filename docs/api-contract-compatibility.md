# API contract compatibility

The API contract gate generates an OpenAPI document directly from the NestJS
controller surface and compares it with the reviewed baseline at
`docs/openapi.json`. Generation does not open a network listener or require live
PostgreSQL, Redis, or object-storage services.

## Run the compatibility gate

```powershell
corepack pnpm api:contract check
```

The command prints a deterministic JSON report and exits nonzero when it finds a
breaking change. CI runs the same command.

The compatibility rules reject:

- removed paths, operations, parameters, responses, schemas, or schema
  properties;
- changed operation IDs or schema types;
- parameters, request bodies, or schema properties that become required;
- narrowed enum values;
- newly added operation-level security requirements.

Additive paths, operations, optional inputs, optional properties, responses, and
enum values remain compatible.

## Review and update the baseline

Do not replace the baseline merely to make CI pass. First run the check, review
every reported change with API consumers, and make sure the change is intentional.
Then use the exact confirmation phrase:

```powershell
corepack pnpm api:contract snapshot --confirm "UPDATE OPENAPI CONTRACT"
corepack pnpm api:contract check
```

Commit the reviewed `docs/openapi.json` with the implementation that changes the
contract. The second command proves that a fresh generation matches the new
baseline.

An alternate baseline can be selected for either command:

```powershell
corepack pnpm api:contract check --baseline contracts/release.json
```

## Request-body schema registry

TypeScript execution through `tsx` does not emit the decorator design metadata
that Nest Swagger normally uses to infer method parameter types. The explicit
registry in `apps/api/src/openapi/request-body-dtos.ts` therefore maps every
JSON-body operation ID to its validated DTO.

When adding or renaming a controller method with `@Body()`:

1. add or update its stable `<Controller>.<method>` registry entry;
2. ensure the DTO has class-validator metadata;
3. run the focused OpenAPI tests and the contract gate;
4. review and snapshot the baseline only if the contract change is intended.

Generation fails if a registry operation no longer exists or a registered DTO
cannot produce a schema. This prevents silently publishing a contract without
request bodies.

## Current baseline coverage

The baseline contains:

- 62 paths;
- 80 operations;
- 37 validated JSON request bodies;
- 36 component schemas;
- the bearer authentication security scheme.

These counts are asserted by the document-generation test so accidental metadata
loss is caught before compatibility comparison.
