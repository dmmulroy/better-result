# Repository-wide error audit

## Build the coverage map first

Inventory all production roots, packages, applications, workers, and runtime entry points. Use this table in the adoption report:

| Production area | Entry points | Reviewed files | Failure mechanisms | Boundaries | Unknowns |
| --------------- | ------------ | -------------: | ------------------ | ---------- | -------- |

Every production area needs a row. A zero-failure area is still accounted for.

## Search for failure mechanisms

Adapt searches to the repository's language and frameworks. Inspect at least:

- `throw`, `try`/`catch`, `Promise.reject`, rejection handlers, and error subclasses
- nullable, `undefined`, boolean, empty-value, and status-object sentinels that mean failure
- parsing, validation, assertions, exhaustive checks, and invariant guards
- fetch/HTTP clients, RPC clients and handlers, database calls, queues, filesystems, subprocesses, and third-party SDKs
- route error handlers, middleware, UI error states, logging, telemetry, and retry logic
- serialization, deserialization, schemas, storage, server actions, and cross-process messages

Use dependency manifests, route registration, framework configuration, and imports to find mechanisms that keyword searches miss. Record commands or equivalent search evidence and occurrence counts. Tests are evidence of intended behavior, not a substitute for production coverage.

## Trace failure paths

For each distinct known failure, trace:

1. the operation and condition that fails
2. its current runtime representation
3. catches, translations, retries, or sentinel checks
4. each caller that propagates it
5. where it is logged, serialized, shown to a user, or discarded
6. state that changed or remained safe before failure

Group repeated sites only when they are the same failure with the same meaning. Keep representative locations and a complete count. Give separate rows to failures that need separate tagged errors.

## Classify each failure

Apply the canonical failure taxonomy in [`tagged-errors.md`](tagged-errors.md#separate-recoverable-failures-from-defects). Record the evidence supporting each disposition and the investigation needed for each unknown.

## Map boundaries

Apply [`result-boundaries.md`](result-boundaries.md) to every HTTP, RPC, queue, server-action, persistence, filesystem, subprocess, worker, and cross-process boundary. For each one record:

- direction and trust level
- values and errors crossing it
- current schema or validation
- whether a `Result` envelope crosses it
- the codec decision and wire schemas
- public error mapping and safe wire fields

## Adoption report structure

Keep the report as the single source of truth:

1. Scope and repository facts
2. Search evidence and counts
3. Production-area coverage map
4. Failure catalog
5. End-to-end propagation paths
6. Boundary and codec map
7. Proposed tagged errors and `Panic` sites
8. Internal and user-facing message mappings
9. Ranked vertical migration slices
10. Unknowns and decisions needed
11. Migration progress and validation log

Suggested failure catalog columns:

| ID  | Failure and trigger | Source sites | Current path | Proposed disposition | Context/cause | User mapping | Boundary/codec | Tests |
| --- | ------------------- | ------------ | ------------ | -------------------- | ------------- | ------------ | -------------- | ----- |

A repository-wide audit is complete only when every production area and discovered mechanism is represented, including grouped counts and explicit unknowns.
