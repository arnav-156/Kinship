# Prompt Registry and Version Comparison

The prompt registry is the source of truth for relationship-brief and draft-message prompt instructions, model parameters, schema ownership, variables, guardrails, lifecycle status, and version metadata. Production rendering resolves exactly one active version per prompt ID.

The registry contains active v1 prompts and inactive v2 candidates. Candidate definitions do not change production behavior until their lifecycle statuses are intentionally reviewed and changed.

## Inspect the registry

Verify structural invariants and print the active versions and stable registry digest:

```bash
corepack pnpm ai:prompts verify
```

List all versions and content digests:

```bash
corepack pnpm ai:prompts list
```

Show one full definition:

```bash
corepack pnpm ai:prompts show relationship-brief --version 1
```

The built-in registry is used by default. Operators can inspect an exported or proposed schema-version `1` registry without changing production code:

```bash
corepack pnpm ai:prompts verify --registry proposed-prompts.json
```

## Compare versions

Compare the active relationship brief with its candidate:

```bash
corepack pnpm ai:prompts compare relationship-brief --from 1 --to 2
```

The report contains:

- Stable content digests for both versions.
- Added and removed system instructions.
- Added and removed guardrails and variables.
- Changed user-instruction keys and their before/after text.
- Temperature and output-schema changes.
- Lifecycle and change-summary metadata.
- Deterministic risk flags.

Use the comparison as a CI risk gate and preserve an immutable report:

```bash
corepack pnpm ai:prompts compare relationship-brief \
  --from 1 \
  --to 2 \
  --fail-on-risk \
  --output artifacts/relationship-brief-v1-v2.json
```

`--fail-on-risk` returns exit code `2` when the target removes a guardrail, system instruction, or variable; increases temperature; or changes the output schema. Invalid registries, missing versions, existing output files, and command errors return exit code `1`.

Risk flags are review signals, not automatic approval or rejection. Additive changes can still be harmful, and a justified schema or temperature change can still be valid after testing.

## Registry invariants

Validation requires:

- Unique prompt/version pairs and version IDs formatted as `<promptId>-v<version>`.
- Exactly one active version for every prompt ID.
- Unique guardrail and variable identifiers within each version.
- Non-empty system and user instructions, owner, change summary, output schema, and ISO timestamp.
- Positive integer versions and bounded temperatures.

The registry currently owns:

- `relationship-brief-v1` as the active brief prompt.
- `relationship-brief-v2` as an inactive candidate with explicit citation coverage.
- `draft-message-v1` as the active draft prompt.
- `draft-message-v2` as an inactive candidate with stronger uncertainty preservation.

The API persists the task-specific active version in AI-run records. Existing callers of `PROMPT_VERSION` retain `relationship-brief-v1`; draft generation and rewrite paths use `DRAFT_PROMPT_VERSION` (`draft-message-v1`).

## Promotion workflow

1. Add a new candidate version; never edit the content of an already-run version in place.
2. Run `ai:prompts verify` and compare the active version with the candidate.
3. Run the AI golden set against the candidate implementation and review groundedness, citation, latency, and cost reports.
4. Obtain human review for instruction, guardrail, schema, variable, and model-parameter changes.
5. Retire the old active version and activate the candidate in one change, preserving exactly one active version.
6. Re-run package and monorepo gates before deployment.

Content digests cover behavior-bearing fields, while the registry digest also covers lifecycle and ownership metadata. Reports refuse to overwrite existing files so review artifacts remain immutable.

## Boundary

The comparison is structural and deterministic; it does not call a model or require an API key. It complements rather than replaces golden-set execution and human evaluation. Prompt selection experiments, automatic traffic splitting, remote prompt management, and evaluation dashboards remain outside this utility.
