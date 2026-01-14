# Migration Guide: v1 to v2

## Breaking Changes

### TaggedError API

**Before (v1):**
```typescript
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

const err = new NotFoundError("123");
```

**After (v2):**
```typescript
class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}> {}

const err = new NotFoundError({ id: "123", message: "Not found: 123" });
```

### Match functions

**Before:**
```typescript
TaggedError.match(error, { ... })
TaggedError.matchPartial(error, { ... }, fallback)
TaggedError.isTaggedError(value)
```

**After:**
```typescript
matchError(error, { ... })
matchErrorPartial(error, { ... }, fallback)
isTaggedError(value)
```


## Automated Migration

Install the OpenCode migration skill:

```bash
npx better-result-migrate v2
```

Then in OpenCode:
```
/skill better-result-migrate-v2
```

Ask: "Migrate my TaggedError classes to v2"

The skill handles:
- Simple and complex class transformations
- Computed messages and validation logic
- Static method migrations (`TaggedError.match` → `matchError`)
- Import updates

## Manual Migration Steps

1. Update class declarations to use factory pattern
2. Change constructor calls to pass object with all props
3. Replace `TaggedError.match` with `matchError`
4. Replace `TaggedError.matchPartial` with `matchErrorPartial`
5. Replace `TaggedError.isTaggedError` with `isTaggedError`
6. Update imports to include new exports

## New Features

### Simpler error definitions
```typescript
// No more boilerplate _tag declarations
class MyError extends TaggedError("MyError")<{ code: number; message: string }>() {}
```

### Dual-style match functions
```typescript
// Data-first
matchError(error, { MyError: e => e.code })

// Data-last (pipeable)
pipe(error, matchError({ MyError: e => e.code }))
```

### Panic (new)

v2 introduces `Panic` — an unrecoverable error thrown when user callbacks throw inside Result operations. This replaces silent failures with explicit defect handling.

```typescript
import { Panic, panic, isPanic } from "better-result";

// Callbacks that throw now cause Panic instead of corrupting state
Result.ok(1).map(() => { throw new Error("bug"); }); // throws Panic

// Generator cleanup throws → Panic
Result.gen(function* () {
  try {
    yield* Result.err("expected");
  } finally {
    throw new Error("cleanup bug"); // throws Panic
  }
});

// Manual panic
panic("something went wrong", cause);

// Type guard
if (isPanic(error)) {
  console.log(error.message, error.cause);
}
```

**Why Panic?** `Err` is for recoverable domain errors. Panic is for bugs — like Rust's `panic!()`. Returning `Err` would collapse type safety.
