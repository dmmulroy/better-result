# Migration Patterns

Concrete before/after examples for migrating `better-result` `TaggedError` code from v1 to v2.

## Pattern 1: Simple class

```ts
// BEFORE
class FooError extends TaggedError {
  readonly _tag = "FooError" as const;
  constructor(readonly id: string) {
    super(`Foo: ${id}`);
  }
}

// AFTER
class FooError extends TaggedError("FooError")<{
  id: string;
  message: string;
}>() {}

// Usage
new FooError({ id: "123", message: "Foo: 123" });
```

## Pattern 2: Computed message

```ts
// BEFORE
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(
    readonly resource: string,
    readonly id: string,
  ) {
    super(`${resource} not found: ${id}`);
  }
}

// AFTER
class NotFoundError extends TaggedError("NotFoundError")<{
  resource: string;
  id: string;
  message: string;
}>() {
  constructor(args: { resource: string; id: string }) {
    super({ ...args, message: `${args.resource} not found: ${args.id}` });
  }
}
```

## Pattern 3: Validation logic

```ts
// BEFORE
class ValidationError extends TaggedError {
  readonly _tag = "ValidationError" as const;
  constructor(readonly field: string) {
    if (!field) throw new Error("field required");
    super(`Invalid: ${field}`);
  }
}

// AFTER
class ValidationError extends TaggedError("ValidationError")<{
  field: string;
  message: string;
}>() {
  constructor(args: { field: string }) {
    if (!args.field) throw new Error("field required");
    super({ ...args, message: `Invalid: ${args.field}` });
  }
}
```

## Pattern 4: Extra runtime properties

```ts
// BEFORE
class TimestampedError extends TaggedError {
  readonly _tag = "TimestampedError" as const;
  readonly timestamp = Date.now();
  constructor(readonly reason: string) {
    super(reason);
  }
}

// AFTER
class TimestampedError extends TaggedError("TimestampedError")<{
  reason: string;
  timestamp: number;
  message: string;
}>() {
  constructor(args: { reason: string }) {
    super({ ...args, message: args.reason, timestamp: Date.now() });
  }
}
```

## Static Helper Migration

| v1 | v2 |
| --- | --- |
| `TaggedError.match(err, handlers)` | `matchError(err, handlers)` |
| `TaggedError.matchPartial(err, handlers, fallback)` | `matchErrorPartial(err, handlers, fallback)` |
| `TaggedError.isTaggedError(value)` | `isTaggedError(value)` or `TaggedError.is(value)` |

## Import Migration

```ts
// BEFORE
import { TaggedError } from "better-result";

// AFTER
import { TaggedError, isTaggedError, matchError, matchErrorPartial } from "better-result";
```

## Full Example

### Input

```ts
import { TaggedError } from "better-result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

class NetworkError extends TaggedError {
  readonly _tag = "NetworkError" as const;
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`Request to ${url} failed with ${status}`);
  }
}

type AppError = NotFoundError | NetworkError;

const handleError = (err: AppError) =>
  TaggedError.match(err, {
    NotFoundError: (e) => `Missing: ${e.id}`,
    NetworkError: (e) => `Failed: ${e.url}`,
  });
```

### Output

```ts
import { TaggedError, matchError } from "better-result";

class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}>() {
  constructor(args: { id: string }) {
    super({ ...args, message: `Not found: ${args.id}` });
  }
}

class NetworkError extends TaggedError("NetworkError")<{
  url: string;
  status: number;
  message: string;
}>() {
  constructor(args: { url: string; status: number }) {
    super({ ...args, message: `Request to ${args.url} failed with ${args.status}` });
  }
}

type AppError = NotFoundError | NetworkError;

const handleError = (err: AppError) =>
  matchError(err, {
    NotFoundError: (e) => `Missing: ${e.id}`,
    NetworkError: (e) => `Failed: ${e.url}`,
  });
```
