# Migrate Result serialization to codecs

Use this branch for every removed `Result.serialize`, `Result.deserialize`, or `Result.hydrate` call.

## 1. Find the boundary contract

For each call, trace the serialized value to its consumer or producer. Record:

- the in-memory Ok and Err payload types
- the wire/storage Ok and Err payload shapes
- whether either direction transforms values such as `Date`, branded values, or error classes
- who handles malformed envelopes and payloads
- whether the chosen Standard Schema validators are synchronous or asynchronous

Create one named codec per coherent boundary contract. Reuse it only where all four payload contracts are identical.

## 2. Define all four schemas

`Result.codec` requires an Ok and Err schema for both directions:

```ts
import { Result, ResultDeserializationError } from "better-result";
import { z } from "zod";

const UserWireSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

const ValidationErrorWireSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const UserResultCodec = Result.codec({
  serialize: {
    ok: UserWireSchema,
    err: ValidationErrorWireSchema,
  },
  deserialize: {
    ok: UserWireSchema,
    err: ValidationErrorWireSchema,
  },
});
```

Identity-like schemas must still validate. When in-memory and wire types differ, use schema transforms in each direction rather than casting the envelope.

## 3. Replace serialization

```ts
// 2.x: cannot fail
const envelope = Result.serialize(result);

// 3.0: payload validation is explicit
const encoded = await UserResultCodec.serialize(result);
```

`encoded` is a `Result<SerializedResult<...>, ResultSerializationError>`. Keep it in Result composition or explicitly handle the error before sending/writing the envelope.

```ts
if (Result.isError(encoded)) {
  reportInvalidOutboundPayload(encoded.error.value, encoded.error.issues);
  return encoded;
}

await transport.send(encoded.value);
```

## 4. Replace deserialization and hydration

```ts
// 2.x
const decoded = Result.deserialize<UserWire, ValidationErrorWire>(input);
// Result.hydrate(...) was an alias

// 3.0
const decoded = await UserResultCodec.deserialize(input);
```

Remove explicit payload type arguments; the schemas infer them. Invalid envelopes and payloads return `ResultDeserializationError`. Handle that variant alongside the decoded Err payload type:

```ts
if (Result.isError(decoded)) {
  if (ResultDeserializationError.is(decoded.error)) {
    reportInvalidInboundPayload(decoded.error.value, decoded.error.issues);
  } else {
    handleRemoteValidationError(decoded.error);
  }
}
```

Import `ResultDeserializationError` where the boundary distinguishes malformed input from a valid serialized Err payload.

## 5. Preserve honest sync/async behavior

Each selected schema determines whether that branch's operation returns `Result` or `Promise<Result>`. Mixed schema configurations can produce `Result | Promise<Result>` when the branch is not statically known. `await` accepts both and is the simplest boundary control flow when callers do not need a synchronous contract.

A schema that reports issues yields `ResultSerializationError` or `ResultDeserializationError`. A schema that throws or rejects is a defect and becomes `Panic`; preserve the repository's defect reporting behavior.

JSON omits properties with `undefined` values. A codec accepts `{ status: "ok" }` or `{ status: "error" }` and passes `undefined` to the selected deserialization schema. Use a schema that accepts `undefined` for `void`/`undefined` payloads; other schemas correctly return `ResultDeserializationError`.

## Completion check

The serialization branch is complete when every old helper call is gone, each boundary has four validating schemas, in-memory/wire transforms are represented by schemas, serialization and deserialization errors are handled, and async behavior is reflected in callers and tests.
