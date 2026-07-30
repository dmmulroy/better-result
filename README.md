# better-result

Lightweight Result type for TypeScript with generator-based composition.

📖 **[Documentation](https://better-result.dev/core/creating-results)**

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

// Recover from specific errors, widening the success type when needed
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

The async try callback receives a `TryPromiseContext` with a 1-based `attempt` number and the optional top-level abort signal. The synchronous `Result.try` callback continues to receive a `TryContext` containing only `attempt`.

```ts
const result = await Result.tryPromise(({ attempt }) => fetchWithRetryContext(url, attempt), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "constant",
  },
});
```

Pass an abort signal in the top-level config to interrupt a pending retry delay and prevent later retries. The signal is also forwarded to every attempt so the try callback can cancel abort-aware operations:

```ts
const controller = new AbortController();

const result = await Result.tryPromise(({ signal }) => fetch(url, { signal }), {
  signal: controller.signal,
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "constant",
  },
});
```

The same signal and failed attempt number are available as the second `shouldRetry` argument for custom retry decisions: `shouldRetry: (error, { attempt, signal }) => boolean`.

`Result.tryPromise` cannot abort an operation by itself. The try callback must pass the signal to operations such as `fetch` that support cancellation. When aborted, retry scheduling stops and the latest typed result is returned.

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

### Dynamic Retry Delays

Pass a callback as `delayMs` when each error determines how long to wait. The callback receives the typed error and the context for the failed attempt. `times` remains required so every retry policy has an explicit limit:

```ts
const result = await Result.tryPromise(
  {
    try: () => callApi(url),
    catch: (cause) => parseApiError(cause),
  },
  {
    retry: {
      times: 3,
      shouldRetry: (error) => error.retryable,
      delayMs: (error, { attempt }) => error.retryAfterMs,
    },
  },
);
```

A dynamic `delayMs` returns the final delay before the next attempt and cannot be combined with `backoff` or `jitter`. If the callback throws, `Result.tryPromise` throws a `Panic`.

### Async Retry Decisions

Retry callbacks are synchronous. For decisions that require async operations (rate limits, feature flags, etc.), enrich the error in the `catch` handler before making the retry decision:

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

### Jitter

To avoid thundering-herd retries when many callers fail at the same time, randomize each delay with `jitter`:

```ts
const result = await Result.tryPromise(() => fetch(url), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential",
    jitter: true, // full jitter: delay is uniform in [0, baseDelay)
  },
});
```

Pass a number from `0` through `1` to control how much of the base delay is randomized:

```ts
retry: {
  times: 3,
  delayMs: 100,
  backoff: "exponential",
  jitter: 0.3, // delay uniform in [0.7 * baseDelay, baseDelay)
}
```

`jitter: true` is equivalent to `jitter: 1`. Values outside the inclusive range from `0` to `1`, including `NaN` and infinities, throw a `Panic` before the first attempt.

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
import { Result, TaggedError, matchError, matchErrorPartial } from "better-result";

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

// Partial matching leaves unhandled errors unchanged by default
const transformed = matchErrorPartial(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
});
// string | ValidationError

// In data-last form, annotate handlers that use variant-specific fields
const transformError = matchErrorPartial({
  NotFoundError: (e: NotFoundError) => `Missing: ${e.id}`,
});
const piped = transformError(error);
// string | ValidationError

// A custom onUnhandled callback can transform unhandled errors
const message = matchErrorPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown: ${e.message}`,
);

// Result.err preserves unhandled variants when composing with tryRecover
const recovered = result.tryRecover(
  matchErrorPartial({ NotFoundError: (e: NotFoundError) => Result.ok(defaultValue) }, Result.err),
);

// Type guards
TaggedError.is(value); // any TaggedError instance, including toJSON()
NotFoundError.is(value); // specific class
```

### Yielding Tagged Errors in `Result.gen`

Tagged errors can short-circuit `Result.gen` directly. This is useful for recoverable domain errors and is equivalent to yielding `Result.err(error)`; it does not throw.

```ts
const result = Result.gen(function* () {
  yield* new NotFoundError({ id: "123", message: "missing" });
  return Result.ok("never reached");
});
// Result<string, NotFoundError>
// => Err(original NotFoundError instance)
```

They also compose with regular `Result` values and contribute to the inferred error union:

```ts
const result = Result.gen(function* () {
  const user = yield* findUser("123"); // Result<User, NotFoundError>

  if (!user.active) {
    yield* new ValidationError({ field: "active", message: "User is inactive" });
  }

  return Result.ok(user);
});
// Result<User, NotFoundError | ValidationError>
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

Build Result-level codecs for RPC, storage, or server actions with Standard Schema-compatible schemas. This example uses Zod, but any Standard Schema implementation works:

```ts
import { z } from "zod";
import {
  Result,
  ResultDeserializationError,
  ResultSerializationError,
  type Result as ResultType,
  type SerializedResult,
} from "better-result";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
});
const UserWireSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  created_at_iso: z.string(),
});
const ValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
const ValidationErrorWireSchema = z.object({
  type: z.string(),
  message: z.string(),
});
type UserWire = z.output<typeof UserWireSchema>;
type ValidationErrorWire = z.output<typeof ValidationErrorWireSchema>;

const UserResultCodec = Result.codec({
  serialize: {
    ok: UserSchema.transform((user) => ({
      id: user.id,
      display_name: user.name,
      created_at_iso: user.createdAt.toISOString(),
    })),
    err: ValidationErrorSchema.transform((error) => ({
      type: error.code,
      message: error.message,
    })),
  },
  deserialize: {
    ok: UserWireSchema.transform((wire) => ({
      id: wire.id,
      name: wire.display_name,
      createdAt: new Date(wire.created_at_iso),
    })),
    err: ValidationErrorWireSchema.transform((wire) => ({
      code: wire.type,
      message: wire.message,
    })),
  },
});

const outbound = await UserResultCodec.serialize(Result.ok(user));
// Ok({ status: "ok", value: { id, display_name, created_at_iso } })

if (Result.isError(outbound) && ResultSerializationError.is(outbound.error)) {
  console.log("Bad payload:", outbound.error.value, outbound.error.issues);
}

const inbound = await outbound.andThenAsync(async (wire) => {
  return await UserResultCodec.deserialize(wire);
});
// Ok(user)

const invalid = await UserResultCodec.deserialize({ foo: "bar" });
if (Result.isError(invalid) && ResultDeserializationError.is(invalid.error)) {
  console.log("Bad envelope or payload:", invalid.error.value, invalid.error.issues);
}

async function createUser(
  data: FormData,
): Promise<ResultType<SerializedResult<UserWire, ValidationErrorWire>, ResultSerializationError>> {
  const result = await validateAndCreate(data);
  return UserResultCodec.serialize(result);
}
```

### Synchronous and asynchronous schemas

Serialization and deserialization infer their return types independently. Within either direction, the selected `ok` or `err` schema determines whether a concrete branch returns a `Result` or a `Promise<Result>`—no runtime mode configuration is needed.

```ts
const serializedOk = MixedCodec.serialize(Result.ok(user)); // Result when serialize.ok is sync
const serializedErr = MixedCodec.serialize(Result.err(error)); // Promise<Result> when serialize.err is async

const deserializedOk = MixedCodec.deserialize({ status: "ok", value: userWire });
const deserializedErr = MixedCodec.deserialize({ status: "error", error: errorWire });
```

When the input's branch is not statically known, mixed schemas honestly return `Result | Promise<Result>`. An `unknown` deserialization input also includes the synchronous `Result` case because an invalid outer envelope fails before a payload schema runs. `await` accepts both forms when callers want one control flow:

```ts
const decoded = await MixedCodec.deserialize(inputFromNetwork);
```

Schema validation issues are returned as `ResultSerializationError` or `ResultDeserializationError`. A schema that throws or returns a rejected Promise is a defect: the codec throws or rejects with `Panic` and preserves the original error as `cause`.

JSON transports omit object properties whose value is `undefined`. The codec therefore accepts `{ status: "ok" }` and `{ status: "error" }` as envelopes and passes the missing payload to the selected deserialization schema as `undefined`. A `void` or `undefined` schema can accept it; schemas requiring another payload return `ResultDeserializationError` with their validation issues.

### Migrating from `Result.serialize` / `Result.deserialize`

`Result.serialize`, `Result.deserialize`, and `Result.hydrate` were removed in 3.0. The old helpers copied payloads without validating them:

```ts
// Before 3.0
const wire = Result.serialize(result); // SerializedResult<User, ValidationError>
const resultOrNull = Result.deserialize<User, ValidationError>(input); // Result | null
```

Create a codec once and let its schemas infer the payload types. For already serializable payloads, use the same validating schemas in both directions:

```ts
// 3.0
const UserResultCodec = Result.codec({
  serialize: { ok: UserToWireSchema, err: ValidationToErrorWireSchema },
  deserialize: { ok: UserFromWireSchema, err: ValidationFromErrorWireSchema },
});

const wirePayloadResult = Result.ok(userWire);
const wireResult = await UserResultCodec.serialize(wirePayloadResult);
// Result<SerializedResult<UserWire, ValidationErrorWire>, ResultSerializationError>

const decoded = await UserResultCodec.deserialize(input);
// Result<UserWire, ValidationErrorWire | ResultDeserializationError>
```

Migration differences:

- Handle `ResultSerializationError` instead of assuming serialization always succeeds.
- Handle `ResultDeserializationError` instead of checking for `null`; its `issues` preserve schema diagnostics when a payload is invalid.
- Remove explicit `<User, ValidationError>` deserialization type arguments. The schemas provide those types.
- Use `await` when a schema is async or when a schema library exposes a sync-or-async Standard Schema validator type.

## API Reference

### Result

| Method                                  | Description                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `Result.ok(value)`                      | Create success                                                                        |
| `Result.err(error)`                     | Create error                                                                          |
| `Result.try(fn)`                        | Wrap throwing function                                                                |
| `Result.tryPromise(fn, config?)`        | Wrap async function with optional retry                                               |
| `Result.isOk(result)`                   | Type guard for Ok                                                                     |
| `Result.isError(result)`                | Type guard for Err                                                                    |
| `Result.gen(fn)`                        | Generator composition                                                                 |
| `Result.tryRecover(result, fn)`         | Recover error, widening the success type when needed                                  |
| `Result.tryRecoverAsync(result, fn)`    | Async recover error, widening the success type when needed                            |
| `Result.tap(result, fn)`                | Run side effect on success and return original result                                 |
| `Result.tapAsync(result, fn)`           | Run async side effect on success and return original result                           |
| `Result.tapError(result, fn)`           | Run side effect on error and return original result                                   |
| `Result.tapErrorAsync(result, fn)`      | Run async side effect on error and return original result                             |
| `Result.tapBoth(result, handlers)`      | Run side effect on either branch and return original result                           |
| `Result.tapBothAsync(result, handlers)` | Run async side effect on either branch and return original result                     |
| `Result.await(promise)`                 | Wrap Promise<Result> for generators                                                   |
| `Result.codec(config)`                  | Build a Result-level codec from Standard Schema-compatible serializers/deserializers  |
| `Result.all(results)`                   | Collect success values or return the first error, preserving tuple types              |
| `Result.allAsync(results)`              | Concurrently await Results, then collect values or return the first input-order error |
| `Result.partition(results)`             | Split Results into success and error arrays, preserving heterogeneous unions          |
| `Result.partitionAsync(results)`        | Concurrently await Results, then split successes and errors into ordered arrays       |
| `Result.flatten(result)`                | Flatten nested Result                                                                 |

### Instance Methods

| Method                    | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `.isOk()`                 | Type guard, narrows to Ok                         |
| `.isErr()`                | Type guard, narrows to Err                        |
| `.map(fn)`                | Transform success value                           |
| `.mapError(fn)`           | Transform error value                             |
| `.tryRecover(fn)`         | Recover error and widen success when needed       |
| `.tryRecoverAsync(fn)`    | Async recover error and widen success when needed |
| `.andThen(fn)`            | Chain Result-returning function                   |
| `.andThenAsync(fn)`       | Chain async Result-returning function             |
| `.match({ ok, err })`     | Pattern match                                     |
| `.unwrap(message?)`       | Extract value or throw                            |
| `.unwrapOr(fallback)`     | Extract value or return fallback                  |
| `.tap(fn)`                | Side effect on success                            |
| `.tapAsync(fn)`           | Async side effect on success                      |
| `.tapError(fn)`           | Side effect on error                              |
| `.tapErrorAsync(fn)`      | Async side effect on error                        |
| `.tapBoth(handlers)`      | Side effect on either branch                      |
| `.tapBothAsync(handlers)` | Async side effect on either branch                |

### TaggedError

| Method                                             | Description                                             |
| -------------------------------------------------- | ------------------------------------------------------- |
| `TaggedError(tag)<Props>()`                        | Factory for tagged error class                          |
| `TaggedError.is(value)`                            | Type guard for any TaggedError                          |
| `matchError(err, handlers)`                        | Exhaustive pattern match by `_tag`                      |
| `matchErrorPartial(error, handlers, onUnhandled?)` | Partial match; unhandled errors pass through by default |
| `isTaggedError(value)`                             | Type guard (standalone function)                        |
| `panic(message, cause?)`                           | Throw unrecoverable Panic                               |
| `isPanic(value)`                                   | Type guard for Panic                                    |

### Type Helpers

| Type                     | Description                  |
| ------------------------ | ---------------------------- |
| `InferOk<R>`             | Extract Ok type from Result  |
| `InferErr<R>`            | Extract Err type from Result |
| `AnyTaggedError`         | Generic TaggedError instance |
| `SerializedResult<T, E>` | Plain object form of Result  |
| `SerializedOk<T>`        | Plain object form of Ok      |
| `SerializedErr<E>`       | Plain object form of Err     |

## Agents & AI

The portable [`adopt-better-result`](skills/adopt-better-result/SKILL.md) skill guides compatible coding agents through either a repository-wide error-handling audit or one named vertical migration slice.

Install it with skills.sh-compatible tooling:

```sh
npx skills add dmmulroy/better-result@adopt-better-result
```

See [`skills/README.md`](skills/README.md) for manual installation and usage details.

## License

MIT
