# Migration Guide: neverthrow to better-result

This guide explains how to migrate from neverthrow's Result/ResultAsync APIs to better-result's Result, generator composition, and TaggedError-based domain errors.

## Quick checklist
1. Replace `ok`/`err` with `Result.ok`/`Result.err` and drop `ResultAsync` imports.
2. Rename methods: `mapErr` -> `mapError`, `asyncAndThen` -> `andThenAsync`.
3. Update `match` calls to object form: `match({ ok, err })`; use `Result.isError` for a static Err guard if needed.
4. Replace ResultAsync flows with `Promise<Result>` and `Result.gen` + `Result.await`.
5. Rewrite missing combinators (`orElse`, `andThrough`, `combineWithAllErrors`).
6. Update tests to use `unwrap()` or `Result.isOk` assertions.

## Import and type changes

```ts
// NEVERTHROW
import { ok, err, Result, ResultAsync } from "neverthrow";
type FetchResult = ResultAsync<User, ApiError>;

// BETTER-RESULT
import { Result } from "better-result";
type FetchResult = Promise<Result<User, ApiError>>;
```

## API mapping

### Same name, same intent
| neverthrow | better-result | Notes |
| --- | --- | --- |
| `Ok` / `Err` | `Ok` / `Err` | Same class names. |
| `isOk()` / `isErr()` | `isOk()` / `isErr()` | Instance type guards. |
| `map` | `map` | Same behavior. |
| `andThen` | `andThen` | Same behavior. |
| `unwrapOr` | `unwrapOr` | Same behavior. |

### Renamed or reshaped
| neverthrow | better-result | Notes |
| --- | --- | --- |
| `ok(value)` | `Result.ok(value)` | Namespaced constructor. |
| `err(error)` | `Result.err(error)` | Namespaced constructor. |
| `mapErr(fn)` | `mapError(fn)` | Rename only. |
| `asyncAndThen(fn)` | `andThenAsync(fn)` | Returns `Promise<Result>`. |
| `match(ok, err)` | `match({ ok, err })` | Object form. |
| `Result.fromThrowable(fn, mapErr)` | `Result.try({ try: () => fn(...), catch: mapErr })` | Wrap in a new function. |
| `ResultAsync.fromPromise(p, mapErr)` | `Result.tryPromise({ try: () => p, catch: mapErr })` | Promise is thunked. |

### Requires rewrite
| neverthrow | better-result pattern |
| --- | --- |
| `ResultAsync` | `Promise<Result>` + `Result.gen` / `Result.await` |
| `okAsync` / `errAsync` | `Promise.resolve(Result.ok/err)` |
| `Result.asyncMap` | `andThenAsync` or `Result.gen` |
| `orElse` | `match` with explicit recovery |
| `andTee` / `orTee` | `tap` or `match` |
| `andThrough` / `asyncAndThrough` | `Result.gen` |
| `combineWithAllErrors` | `Result.partition` + aggregation |
| `safeTry` | `Result.gen` |

## Migration recipes

### Wrap throwing code

```ts
// NEVERTHROW
const parseJson = Result.fromThrowable(JSON.parse, toParseError);

// BETTER-RESULT
const parseJson = (input: string) =>
  Result.try({
    try: () => JSON.parse(input),
    catch: toParseError,
  });
```

### Replace ResultAsync chains

```ts
// NEVERTHROW
const result = ResultAsync.fromPromise(fetchUser(id), toApiError)
  .andThen(validateUser)
  .andThen(saveUser);

// BETTER-RESULT
const result = await Result.gen(async function* () {
  const user = yield* Result.await(
    Result.tryPromise({ try: () => fetchUser(id), catch: toApiError })
  );
  const valid = yield* validateUser(user);
  const saved = yield* Result.await(saveUser(valid));
  return Result.ok(saved);
});
```

### Replace orElse

```ts
// NEVERTHROW
const recovered = result.orElse((e) =>
  e.type === "NotFound" ? ok(defaultValue) : err(e)
);

// BETTER-RESULT
const recovered = result.match({
  ok: Result.ok,
  err: (e) => (e._tag === "NotFoundError" ? Result.ok(defaultValue) : Result.err(e)),
});
```

### Combine with all errors

```ts
const [oks, errs] = Result.partition(results);
const combined = errs.length > 0 ? Result.err(errs) : Result.ok(oks);
```

### safeTry to Result.gen

```ts
// NEVERTHROW
const result = safeTry(function* () {
  const a = yield* parseA();
  const b = yield* parseB();
  return ok(a + b);
});

// BETTER-RESULT
const result = Result.gen(function* () {
  const a = yield* parseA();
  const b = yield* parseB();
  return Result.ok(a + b);
});
```

## Better-result extras to adopt
- TaggedError classes with `matchError`/`matchErrorPartial` for exhaustive unions.
- `Result.isOk` and `Result.isError` for static type guards.
- `Result.tryPromise` retry configuration (`times`, `delayMs`, `backoff`, `shouldRetry`).
- `UnhandledException` when you skip a `catch` mapper in `Result.try` or `Result.tryPromise`.
- `Panic` when callbacks throw inside Result operations (treat as defect, not Err).
- `Result.serialize`/`Result.deserialize` for RPC or server action boundaries.

## Full example

```ts
// NEVERTHROW
import { ok, Result, ResultAsync, safeTry } from "neverthrow";

const parseJson = Result.fromThrowable(JSON.parse, (cause) => new Error(String(cause)));

const fetchUser = (id: string) =>
  ResultAsync.fromPromise(fetch(`/api/users/${id}`).then((r) => r.json()), (e) => new Error(String(e)));

const getProfile = (input: string, id: string) =>
  safeTry(async function* () {
    const parsed = yield* parseJson(input);
    const user = yield* fetchUser(id);
    return ok({ parsed, user });
  });
```

```ts
// BETTER-RESULT
import { Result, TaggedError } from "better-result";

class ParseError extends TaggedError("ParseError")<{ message: string }>() {}
class ApiError extends TaggedError("ApiError")<{ message: string }>() {}

const parseJson = (input: string) =>
  Result.try({
    try: () => JSON.parse(input),
    catch: (cause) => new ParseError({ message: String(cause) }),
  });

const fetchUser = (id: string) =>
  Result.tryPromise({
    try: () => fetch(`/api/users/${id}`).then((r) => r.json() as Promise<User>),
    catch: (cause) => new ApiError({ message: String(cause) }),
  });

const getProfile = (input: string, id: string) =>
  Result.gen(async function* () {
    const parsed = yield* parseJson(input);
    const user = yield* Result.await(fetchUser(id));
    return Result.ok({ parsed, user });
  });
```
