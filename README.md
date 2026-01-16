# better-result
Lightweight Result type for TypeScript with generator-based composition.




## Install
**New to better-result?** 
```sh
npx better-result init
```


**Upgrading from v1?** 
```sh
npx better-result migrate
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
- [Error Recovery](#error-recovery)
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
const result = fetchUser(id).mapError(
  (e) => new AppError(`Failed to fetch user: ${e.message}`),
);

// Recover from specific errors using orElse
const result = fetchUser(id).orElse((e) =>
  e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
);

// Or use pattern matching for complex logic
const result = fetchUser(id).match({
  ok: (user) => Result.ok(user.id),
  err: (e) =>
    e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
});
```

## Error Recovery

```ts
// Provide a fallback Result
const result = fetchUser(id).orElse((e) =>
  e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
);

// Recover with a throwing function (sync)
const parsed = Result.try(() => JSON.parse(input))
  .orElseTry(() => JSON.parse(repaired));

// Async recovery
const result = await fetchPrimary(id)
  .orElseAsync(async (e) => fetchBackup(id));

// Async recovery wrapping a throwing promise
const result = await fetchPrimary(id)
  .orElseTryPromise(async () => fetchBackup(id));
```

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
import { Panic } from "better-result";

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
```

**Why Panic?** `Err` is for recoverable domain errors. Panic is for bugs — like Rust's `panic!()`. If your `.map()` callback throws, that's not an error to handle, it's a defect to fix. Returning `Err` would collapse type safety (`Result<T, E>` becomes `Result<T, E | unknown>`).

**Panic properties:**

| Property  | Type      | Description                         |
| --------- | --------- | ----------------------------------- |
| `message` | `string`  | Describes where/what panicked       |
| `cause`   | `unknown` | The exception that was thrown       |

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
import { Result, SerializedResult } from "better-result";

// Serialize to plain object
const result = Result.ok(42);
const serialized = Result.serialize(result);
// { status: "ok", value: 42 }

// Deserialize back to Result instance
const deserialized = Result.deserialize<number, never>(serialized);
// Ok(42) - can use .map(), .andThen(), etc.

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

| Method                           | Description                             |
| -------------------------------- | --------------------------------------- |
| `Result.ok(value)`               | Create success                          |
| `Result.err(error)`              | Create error                            |
| `Result.try(fn)`                 | Wrap throwing function                  |
| `Result.tryPromise(fn, config?)` | Wrap async function with optional retry |
| `Result.isOk(result)`            | Type guard for Ok                       |
| `Result.isError(result)`         | Type guard for Err                      |
| `Result.gen(fn)`                 | Generator composition                   |
| `Result.await(promise)`          | Wrap Promise<Result> for generators     |
| `Result.serialize(result)`       | Convert Result to plain object          |
| `Result.deserialize(value)`      | Rehydrate serialized Result             |

### Instance Methods

| Method                  | Description                           |
| ----------------------- | ------------------------------------- |
| `.map(fn)`              | Transform success value               |
| `.mapError(fn)`         | Transform error value                 |
| `.andThen(fn)`          | Chain Result-returning function       |
| `.andThenAsync(fn)`     | Chain async Result-returning function |
| `.orElse(fn)`           | Recover from error with Result        |
| `.orElseTry(fn)`        | Recover with throwing function        |
| `.orElseAsync(fn)`      | Async recovery with Result            |
| `.orElseTryPromise(fn)` | Async recovery with throwing promise  |
| `.match({ ok, err })`   | Pattern match                         |
| `.unwrap(message?)`     | Extract value or throw                |
| `.unwrapOr(fallback)`   | Extract value or return fallback      |
| `.tap(fn)`              | Side effect on success                |
| `.tapAsync(fn)`         | Async side effect on success          |

### TaggedError

| Method                                  | Description                        |
| --------------------------------------- | ---------------------------------- |
| `TaggedError(tag)<Props>()`             | Factory for tagged error class     |
| `TaggedError.is(value)`                 | Type guard for any TaggedError     |
| `matchError(err, handlers)`             | Exhaustive pattern match by `_tag` |
| `matchErrorPartial(err, handlers, fb)`  | Partial match with fallback        |
| `isTaggedError(value)`                  | Type guard (standalone function)   |
| `panic(message, cause?)`                | Throw unrecoverable Panic          |
| `isPanic(value)`                        | Type guard for Panic               |

### Type Helpers

| Type                      | Description                       |
| ------------------------- | --------------------------------- |
| `InferOk<R>`              | Extract Ok type from Result       |
| `InferErr<R>`             | Extract Err type from Result      |
| `SerializedResult<T, E>`  | Plain object form of Result       |
| `SerializedOk<T>`         | Plain object form of Ok           |
| `SerializedErr<E>`        | Plain object form of Err          |

## Agents & AI

better-result ships with skills for AI coding agents (OpenCode, Claude Code, Codex).

### Quick Start

```sh
npx better-result init
```

Interactive setup that:

1. Installs the better-result package
2. Optionally fetches source code via [opensrc](https://github.com/anthropics/opensrc) for better AI context
3. Installs the adoption skill + `/adopt-better-result` command for your agent
4. Optionally launches your agent

### What the skill does

The `/adopt-better-result` command guides your AI agent through:

- Converting try/catch to Result.try/tryPromise
- Defining TaggedError classes for domain errors
- Refactoring to generator composition
- Migrating null checks to Result types

### Supported agents

| Agent    | Config detected          | Skill location                     |
| -------- | ------------------------ | ---------------------------------- |
| OpenCode | `.opencode/`             | `.opencode/skill/better-result-adopt/` |
| Claude   | `.claude/`, `CLAUDE.md`  | `.claude/skills/better-result-adopt/`  |
| Codex    | `.codex/`, `AGENTS.md`   | `.codex/skills/better-result-adopt/`   |

### Manual usage

If you prefer not to use the interactive CLI:

```sh
# Install package
npm install better-result

# Add source for AI context (optional)
npx opensrc better-result

# Then copy skills/ directory to your agent's skill folder
```

## License

MIT
