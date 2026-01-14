---
name: better-result-migrate-v2
description: Migrate better-result TaggedError from v1 (class-based) to v2 (factory-based) API
---

# better-result-migrate

Migrate `better-result` TaggedError classes from v1 (class-based) to v2 (factory-based) API.

## When to Use

- Upgrading `better-result` from v1 to v2
- User asks to migrate TaggedError classes
- User mentions TaggedError v1/v2 migration

## V1 API (old)

```typescript
class FooError extends TaggedError {
  readonly _tag = "FooError" as const;
  constructor(readonly id: string) {
    super(`Foo: ${id}`);
  }
}

// Static methods on TaggedError
TaggedError.match(err, { ... })
TaggedError.matchPartial(err, { ... }, fallback)
TaggedError.isTaggedError(value)
```

## V2 API (new)

```typescript
class FooError extends TaggedError("FooError")<{
  id: string;
  message: string;
}>() {}

// Standalone functions
matchError(err, { ... })
matchErrorPartial(err, { ... }, fallback)
isTaggedError(value)
TaggedError.is(value)  // also available
FooError.is(value)     // class-specific check
```

## Migration Rules

### 1. Simple class (no constructor logic)

```typescript
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

// Usage changes:
// BEFORE: new FooError("123")
// AFTER:  new FooError({ id: "123", message: "Foo: 123" })
```

### 2. Class with computed message

Keep custom constructor to derive message:

```typescript
// BEFORE
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly resource: string, readonly id: string) {
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

// Usage: new NotFoundError({ resource: "User", id: "123" })
```

### 3. Class with validation

Keep validation in custom constructor:

```typescript
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

### 4. Class with additional runtime properties

```typescript
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

### 5. Static method migrations

| V1 | V2 |
|----|-----|
| `TaggedError.match(err, handlers)` | `matchError(err, handlers)` |
| `TaggedError.matchPartial(err, handlers, fallback)` | `matchErrorPartial(err, handlers, fallback)` |
| `TaggedError.isTaggedError(x)` | `isTaggedError(x)` or `TaggedError.is(x)` |

### 6. Import updates

```typescript
// BEFORE
import { TaggedError } from "better-result";

// AFTER
import { TaggedError, matchError, matchErrorPartial, isTaggedError } from "better-result";
```

## Workflow

1. **Find TaggedError classes**: Search for `extends TaggedError` in the codebase
2. **Analyze each class**:
   - Extract `_tag` value
   - Identify constructor params and their types
   - Check for constructor logic (validation, computed message, side effects)
3. **Transform class**:
   - Simple: Remove constructor, add props to type parameter
   - Complex: Keep custom constructor, transform to object args
4. **Update usages**: Change `new FooError(a, b)` to `new FooError({ a, b, message })`
5. **Migrate static methods**: `TaggedError.match` → `matchError`, etc.
6. **Update imports**: Add `matchError`, `matchErrorPartial`, `isTaggedError`

## Example Full Migration

**Input:**
```typescript
import { TaggedError } from "better-result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

class NetworkError extends TaggedError {
  readonly _tag = "NetworkError" as const;
  constructor(readonly url: string, readonly status: number) {
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

**Output:**
```typescript
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
