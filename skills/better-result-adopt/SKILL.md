---
name: better-result-adopt
description: Adopt better-result in an existing TypeScript codebase. Use when replacing try/catch, Promise rejection handling, null sentinels, or thrown domain exceptions with typed Result workflows.
references:
  - references/tagged-errors.md
---

# better-result Adopt

Adopt `better-result` incrementally in existing codebases without rewriting everything at once.

## When to Use

Use this skill when the user wants to:

- migrate from try/catch to `Result.try` or `Result.tryPromise`
- replace nullable return values with typed `Result<T, E>`
- define domain-specific `TaggedError` types
- refactor nested error handling into `andThen` chains or `Result.gen`
- standardize error handling across a service or module

## Reading Order

| Task | Files to Read |
| --- | --- |
| Adopt better-result in a module | This file |
| Define or review error types | `references/tagged-errors.md` |
| Inspect library implementation details | `opensrc/` if present |

## Prerequisites

Before editing code:

1. Confirm `better-result` is already installed in the target project.
2. Check for an `opensrc/` directory. If present, read the package source there for current patterns.
3. Identify the migration scope first: one file, one module, or one boundary layer.

## Migration Strategy

### 1. Start at boundaries

Begin with I/O boundaries and exception-heavy code:

- HTTP clients
- database access
- file system operations
- parsing and validation
- framework adapters

Do not convert the whole codebase at once.

### 2. Classify existing failures

| Category | Examples | Target shape |
| --- | --- | --- |
| Domain errors | not found, validation, auth | `TaggedError` + `Result.err` |
| Infrastructure errors | network, DB, file I/O | `Result.tryPromise` + mapped error |
| Programmer defects | bad assumptions, null deref | leave throwing; defects become `Panic` inside Result callbacks |

### 3. Migrate in this order

1. Define error types.
2. Wrap throwing boundaries with `Result.try` / `Result.tryPromise`.
3. Replace null or boolean sentinel returns with `Result`.
4. Refactor call sites to propagate `Result` values.
5. Collapse nested branching into `andThen`, `mapError`, or `Result.gen`.

## Core Transformations

### Try/catch → `Result.try`

```ts
function parseConfig(json: string): Result<Config, ParseError> {
  return Result.try({
    try: () => JSON.parse(json) as Config,
    catch: (cause) => new ParseError({ cause, message: `Parse failed: ${cause}` }),
  });
}
```

### Async throws → `Result.tryPromise`

```ts
async function fetchUser(id: string): Promise<Result<User, ApiError | UnhandledException>> {
  return Result.tryPromise({
    try: async () => {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new ApiError({ status: res.status, message: `API ${res.status}` });
      return res.json() as Promise<User>;
    },
    catch: (cause) =>
      cause instanceof ApiError ? cause : new UnhandledException({ cause }),
  });
}
```

### Null sentinel → `Result`

```ts
function findUser(id: string): Result<User, NotFoundError> {
  const user = users.find((candidate) => candidate.id === id);
  return user
    ? Result.ok(user)
    : Result.err(new NotFoundError({ id, message: `User ${id} not found` }));
}
```

### Nested flow → `Result.gen`

```ts
async function processOrder(orderId: string): Promise<Result<OrderResult, OrderError>> {
  return Result.gen(async function* () {
    const order = yield* Result.await(fetchOrder(orderId));
    const validated = yield* validateOrder(order);
    const result = yield* Result.await(submitOrder(validated));
    return Result.ok(result);
  });
}
```

## Execution Workflow

1. Audit the target module for `try`, `catch`, `.catch(...)`, `throw`, `null`, `undefined`, and status-flag error handling.
2. Define or update `TaggedError` classes before changing control flow.
3. Convert boundary functions first and change their signatures to `Result<T, E>` or `Promise<Result<T, E>>`.
4. Update immediate callers so they handle or propagate the new `Result`.
5. Where multiple Result-returning steps compose, use `Result.gen` or `andThen`.
6. Preserve error context by keeping `cause`, IDs, messages, and other structured fields.
7. Run tests and add coverage for both success and error paths.

## Completion Criteria

A migration is complete when:

- target functions no longer rely on try/catch for expected domain failures
- nullable or sentinel error returns are replaced with explicit `Result` values
- domain failures use typed `TaggedError` classes
- callers either propagate `Result` or explicitly unwrap/match it
- tests cover at least one success path and one representative error path

## Common Pitfalls

- Over-wrapping everything instead of starting at boundaries
- Losing original failure context when mapping errors
- Mixing `throw`-based and `Result`-based APIs deep in the same flow
- Catching `Panic` instead of fixing the underlying defect

## In This Reference

| File | Purpose |
| --- | --- |
| `references/tagged-errors.md` | TaggedError patterns, matching, type guards, and examples |

If `opensrc/` exists, treat it as the source of truth for implementation details and current API behavior.
