# better-result

Lightweight Result type for TypeScript with generator-based composition.

## Install

```sh
npm install better-result
```

Or with Bun / pnpm:

```sh
bun add better-result
pnpm add better-result
```

## Quick Start

```ts
import { Result } from "better-result";

// Wrap throwing functions
const parsed = Result.try(() => JSON.parse(input));

// Check and use
if (Result.isOk(parsed)) {
  console.log(parsed.value);
} else {
  console.error(parsed.error);
}

// Or use pattern matching
const message = parsed.match({
  ok: (data) => `Got: ${data.name}`,
  err: (e) => `Failed: ${e.message}`,
});
```

## Contents

- [Creating Results](#creating-results)
- [Transforming Results](#transforming-results)
- [Handling Errors](#handling-errors)
- [Observing Results](#observing-results)
- [Extracting Values](#extracting-values)
- [Generator Composition](#generator-composition)
- [Retry Support](#retry-support)
- [UnhandledException](#unhandledexception)
- [Panic](#panic)
- [Tagged Errors](#tagged-errors)
- [Serialization](#serialization)
- [API Reference](#api-reference)
- [Agents & AI](#agents--ai)

## Creating Results

```ts
// Success
const ok = Result.ok(42);

// Error
const err = Result.err(new Error("failed"));

// From throwing function
const result = Result.try(() => riskyOperation());

// From promise
const result = await Result.tryPromise(() => fetch(url));

// With custom error handling
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
```

## Transforming Results

```ts
const result = Result.ok(2)
  .map((x) => x * 2) // Ok(4)
  .andThen(
    (
      x, // Chain Result-returning functions
    ) => (x > 0 ? Result.ok(x) : Result.err("negative")),
  );

// Standalone functions (data-first or data-last)
Result.map(result, (x) => x + 1);
Result.map((x) => x + 1)(result); // Pipeable
```

## Handling Errors

```ts
// Transform error type
const result = fetchUser(id).mapError((e) => new AppError(`Failed to fetch user: ${e.message}`));

// Recover from specific errors while preserving the same success type
const result = fetchUser(id).tryRecover((e) =>
  e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
);

// Async recovery follows the same pattern
// If fetchUser is async and returns Promise<Result<User, E>>, await it first.
const result = await (
  await fetchUser(id)
).tryRecoverAsync(async (e) =>
  e._tag === "NetworkError" ? Result.ok(await readUserFromCache(id)) : Result.err(e),
);
```

## Observing Results

Use `tap` / `tapAsync` for success-side logging or tracing, `tapError` / `tapErrorAsync` for error-side logging or tracing, and `tapBoth` / `tapBothAsync` when you want to observe either branch with one handler object. These methods do not transform the `Result` — they always return the original value unchanged.

```ts
const result = Result.try(() => JSON.parse(input))
  .tap((value) => {
    console.debug("parsed payload", value);
  })
  .tapError((error) => {
    console.error("failed to parse payload", error);
  });
```

If you want to observe both branches symmetrically with one call, use `tapBoth`:

```ts
const result = Result.try(() => JSON.parse(input)).tapBoth({
  ok: (value) => {
    console.info("decoded payload", value);
  },
  err: (error) => {
    console.warn("decode failed", error);
  },
});
```

Async side effects follow the same pattern:

```ts
const result = await Result.err("request failed").tapErrorAsync(async (error) => {
  await trace("request.failed", { error });
});
```

`tapBothAsync` works the same way for async observers on either branch:

```ts
const observed = await Result.tapBothAsync(
  Result.try(() => JSON.parse(input)),
  {
    ok: async (value) => {
      await trace("payload.decoded", { value });
    },
    err: async (error) => {
      await trace("payload.decode_failed", { error });
    },
  },
);
```

Static helpers support both data-first and data-last styles:

```ts
const traced = Result.tapError(Result.err("cache miss"), (error) => {
  console.warn("cache lookup failed", error);
});

const traceError = Result.tapErrorAsync(async (error: string) => {
  await trace("cache.lookup_failed", { error });
});

await traceError(Result.err("cache miss"));
```

If you prefer, you can still observe both branches by chaining `tap` and `tapError` separately.

Thrown or rejected side-effect callbacks become `Panic`, just like other Result callbacks.

## Extracting Values

```ts
// Unwrap (throws on Err)
const value = result.unwrap();
const value = result.unwrap("custom error message");

// With fallback
const value = result.unwrapOr(defaultValue);

// Pattern match
const value = result.match({
  ok: (v) => v,
  err: (e) => fallback,
});
```

## Generator Composition

Chain multiple Results without nested callbacks or early returns:

```ts
const result = Result.gen(function* () {
  const a = yield* parseNumber(inputA); // Unwraps or short-circuits
  const b = yield* parseNumber(inputB);
  const c = yield* divide(a, b);
  return Result.ok(c);
});
// Result<number, ParseError | DivisionError>
```

Async version with `Result.await`:

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser(id));
  const posts = yield* Result.await(fetchPosts(user.id));
  return Result.ok({ user, posts });
});
```

Errors from all yielded Results are automatically collected into the final error union type.

### Normalizing Error Types

Use `mapError` on the output of `Result.gen()` to unify multiple error types into a single type:

```ts
class ParseError extends TaggedError("ParseError")<{ message: string }>() {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }>() {}
class AppError extends TaggedError("AppError")<{ source: string; message: string }>() {}

const result = Result.gen(function* () {
  const parsed = yield* parseInput(input); // Err: ParseError
  const valid = yield* validate(parsed); // Err: ValidationError
  return Result.ok(valid);
}).mapError((e): AppError => new AppError({ source: e._tag, message: e.message }));
// Result<ValidatedData, AppError> - error union normalized to single type
```

## Retry Support

```ts
const result = await Result.tryPromise(() => fetch(url), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential", // or "linear" | "constant"
  },
});
```

### Conditional Retry

Retry only for specific error types using `shouldRetry`:

```ts
class NetworkError extends TaggedError("NetworkError")<{ message: string }>() {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }>() {}

const result = await Result.tryPromise(
  {
    try: () => fetchData(url),
    catch: (e) =>
      e instanceof TypeError // Network failures often throw TypeError
        ? new NetworkError({ message: (e as Error).message })
        : new ValidationError({ message: String(e) }),
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => e._tag === "NetworkError", // Only retry network errors
    },
  },
);
```

### Async Retry Decisions

For retry decisions that require async operations (rate limits, feature flags, etc.), enrich the error in the `catch` handler instead of making `shouldRetry` async:

```ts
class ApiError extends TaggedError("ApiError")<{
  message: string;
  rateLimited: boolean;
}>() {}

const result = await Result.tryPromise(
  {
    try: () => callApi(url),
    catch: async (e) => {
      // Fetch async state in catch handler
      const retryAfter = await redis.get(`ratelimit:${userId}`);
      return new ApiError({
        message: (e as Error).message,
        rateLimited: retryAfter !== null,
      });
    },
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => !e.rateLimited, // Sync predicate uses enriched error
    },
  },
);
```

## UnhandledException

When `Result.try()` or `Result.tryPromise()` catches an exception without a custom handler, the error type is `UnhandledException`:

```ts
import { Result, UnhandledException } from "better-result";

// Automatic — error type is UnhandledException
const result = Result.try(() => JSON.parse(input));
//    ^? Result<unknown, UnhandledException>

// Custom handler — you control the error type
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
//    ^? Result<unknown, ParseError>

// Same for async
await Result.tryPromise(() => fetch(url));
//    ^? Promise<Result<Response, UnhandledException>>
```

Access the original exception via `.cause`:

```ts
if (Result.isError(result)) {
  const original = result.error.cause;
  if (original instanceof SyntaxError) {
    // Handle JSON parse error
  }
}
```

## Panic

Thrown (not returned) when user callbacks throw inside Result operations. Represents a defect in your code, not a domain error.

```ts
import { Panic, isPanic } from "better-result";

// Callback throws → Panic
Result.ok(1).map(() => {
  throw new Error("bug");
}); // throws Panic

// Generator cleanup throws → Panic
Result.gen(function* () {
  try {
    yield* Result.err("expected failure");
  } finally {
    throw new Error("cleanup bug");
  }
}); // throws Panic

// Catch handler throws → Panic
Result.try({
  try: () => riskyOp(),
  catch: () => {
    throw new Error("bug in handler");
  },
}); // throws Panic

// Catching Panic (for error reporting)
try {
  result.map(() => {
    throw new Error("bug");
  });
} catch (error) {
  if (isPanic(error)) {
    // isPanic() is a type guard function
    console.error("Defect:", error.message, error.cause);
  }

  if (Panic.is(error)) {
    // Panic.is() is a static method (same behavior)
  }

  if (error instanceof Panic) {
    // instanceof works too
  }
}
```

**Why Panic?** `Err` is for recoverable domain errors. Panic is for bugs — like Rust's `panic!()`. If your `.map()` callback throws, that's not an error to handle, it's a defect to fix. Returning `Err` would collapse type safety (`Result<T, E>` becomes `Result<T, E | unknown>`).

**Panic properties:**

| Property  | Type      | Description                   |
| --------- | --------- | ----------------------------- |
| `message` | `string`  | Describes where/what panicked |
| `cause`   | `unknown` | The exception that was thrown |

Panic also provides `toJSON()` for error reporting services (Sentry, etc.).

## Tagged Errors

Build exhaustive error handling with discriminated unions:

```ts
import { TaggedError, matchError, matchErrorPartial } from "better-result";

// Factory API: TaggedError("Tag")<Props>()
class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}>() {}

class ValidationError extends TaggedError("ValidationError")<{
  field: string;
  message: string;
}>() {}

type AppError = NotFoundError | ValidationError;

// Create errors with object args
const err = new NotFoundError({ id: "123", message: "User not found" });

// Exhaustive matching
matchError(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Bad field: ${e.field}`,
});

// Partial matching with fallback
matchErrorPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown: ${e.message}`,
);

// Type guards
TaggedError.is(value); // any tagged error
NotFoundError.is(value); // specific class
```

For errors with computed messages, add a custom constructor:

```ts
class NetworkError extends TaggedError("NetworkError")<{
  url: string;
  status: number;
  message: string;
}>() {
  constructor(args: { url: string; status: number }) {
    super({ ...args, message: `Request to ${args.url} failed: ${args.status}` });
  }
}

new NetworkError({ url: "/api", status: 404 });
```

## Serialization

Convert Results to plain objects for RPC, storage, or server actions:

```ts
import { Result, SerializedResult, ResultDeserializationError } from "better-result";

// Serialize to plain object
const result = Result.ok(42);
const serialized = Result.serialize(result);
// { status: "ok", value: 42 }

// Deserialize back to Result instance
const deserialized = Result.deserialize<number, never>(serialized);
// Ok(42) - can use .map(), .andThen(), etc.

// Invalid input returns ResultDeserializationError
const invalid = Result.deserialize({ foo: "bar" });
if (Result.isError(invalid) && ResultDeserializationError.is(invalid.error)) {
  console.log("Bad input:", invalid.error.value);
}

// Typed boundary for Next.js server actions
async function createUser(data: FormData): Promise<SerializedResult<User, ValidationError>> {
  const result = await validateAndCreate(data);
  return Result.serialize(result);
}

// Client-side
const serialized = await createUser(formData);
const result = Result.deserialize<User, ValidationError>(serialized);
```

## API Reference

### Result

| Method                                  | Description                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Result.ok(value)`                      | Create success                                                                           |
| `Result.err(error)`                     | Create error                                                                             |
| `Result.try(fn)`                        | Wrap throwing function                                                                   |
| `Result.tryPromise(fn, config?)`        | Wrap async function with optional retry                                                  |
| `Result.isOk(result)`                   | Type guard for Ok                                                                        |
| `Result.isError(result)`                | Type guard for Err                                                                       |
| `Result.gen(fn)`                        | Generator composition                                                                    |
| `Result.tryRecover(result, fn)`         | Recover error into same success type                                                     |
| `Result.tryRecoverAsync(result, fn)`    | Async recover error into same success type                                               |
| `Result.tap(result, fn)`                | Run side effect on success and return original result                                    |
| `Result.tapAsync(result, fn)`           | Run async side effect on success and return original result                              |
| `Result.tapError(result, fn)`           | Run side effect on error and return original result                                      |
| `Result.tapErrorAsync(result, fn)`      | Run async side effect on error and return original result                                |
| `Result.tapBoth(result, handlers)`      | Run side effect on either branch and return original result                              |
| `Result.tapBothAsync(result, handlers)` | Run async side effect on either branch and return original result                        |
| `Result.await(promise)`                 | Wrap Promise<Result> for generators                                                      |
| `Result.serialize(result)`              | Convert Result to plain object                                                           |
| `Result.deserialize(value)`             | Rehydrate serialized Result (returns `Err<ResultDeserializationError>` on invalid input) |
| `Result.partition(results)`             | Split array into [okValues, errValues]                                                   |
| `Result.flatten(result)`                | Flatten nested Result                                                                    |

### Instance Methods

| Method                    | Description                                |
| ------------------------- | ------------------------------------------ |
| `.isOk()`                 | Type guard, narrows to Ok                  |
| `.isErr()`                | Type guard, narrows to Err                 |
| `.map(fn)`                | Transform success value                    |
| `.mapError(fn)`           | Transform error value                      |
| `.tryRecover(fn)`         | Recover error into same success type       |
| `.tryRecoverAsync(fn)`    | Async recover error into same success type |
| `.andThen(fn)`            | Chain Result-returning function            |
| `.andThenAsync(fn)`       | Chain async Result-returning function      |
| `.match({ ok, err })`     | Pattern match                              |
| `.unwrap(message?)`       | Extract value or throw                     |
| `.unwrapOr(fallback)`     | Extract value or return fallback           |
| `.tap(fn)`                | Side effect on success                     |
| `.tapAsync(fn)`           | Async side effect on success               |
| `.tapError(fn)`           | Side effect on error                       |
| `.tapErrorAsync(fn)`      | Async side effect on error                 |
| `.tapBoth(handlers)`      | Side effect on either branch               |
| `.tapBothAsync(handlers)` | Async side effect on either branch         |

### TaggedError

| Method                                 | Description                        |
| -------------------------------------- | ---------------------------------- |
| `TaggedError(tag)<Props>()`            | Factory for tagged error class     |
| `TaggedError.is(value)`                | Type guard for any TaggedError     |
| `matchError(err, handlers)`            | Exhaustive pattern match by `_tag` |
| `matchErrorPartial(err, handlers, fb)` | Partial match with fallback        |
| `isTaggedError(value)`                 | Type guard (standalone function)   |
| `panic(message, cause?)`               | Throw unrecoverable Panic          |
| `isPanic(value)`                       | Type guard for Panic               |

### Type Helpers

| Type                     | Description                  |
| ------------------------ | ---------------------------- |
| `InferOk<R>`             | Extract Ok type from Result  |
| `InferErr<R>`            | Extract Err type from Result |
| `SerializedResult<T, E>` | Plain object form of Result  |
| `SerializedOk<T>`        | Plain object form of Ok      |
| `SerializedErr<E>`       | Plain object form of Err     |

## Agents & AI

better-result ships with portable `SKILL.md` skills instead of an interactive CLI.

### Available skills

- `better-result-adopt` — adopt `better-result` in an existing codebase
- `better-result-migrate-v2` — migrate v1 `TaggedError` usage to the v2 API

These skills are designed to work with SKILL.md-compatible agents and skills.sh-compatible tooling.

### Install with skills.sh-compatible tooling

```sh
npx skills add dmmulroy/better-result@better-result-adopt
npx skills add dmmulroy/better-result@better-result-migrate-v2
```

To install globally without prompts:

```sh
npx skills add dmmulroy/better-result@better-result-adopt -g -y
```

### Manual installation

If your agent does not support skills.sh installation, copy one of these directories into the agent's skills folder:

- `skills/better-result-adopt/`
- `skills/better-result-migrate-v2/`

### What the skills do

`better-result-adopt` guides an agent through:

- converting try/catch to `Result.try` / `Result.tryPromise`
- defining `TaggedError` classes for domain errors
- refactoring nested error handling into `Result.gen`
- replacing nullable or sentinel error returns with `Result`

`better-result-migrate-v2` guides an agent through:

- migrating `TaggedError` classes from v1 to v2 factory syntax
- updating constructor call sites to the new object form
- replacing `TaggedError.match*` helpers with standalone helpers
- updating imports and verifying no old API usages remain

### Optional source context

For richer AI context in a consuming project:

```sh
npx opensrc better-result
```

See [skills/README.md](skills/README.md) for a concise skill-install reference.

## License

MIT
