# Migrate Result serialization to codecs

Use this branch for every removed `Result.serialize`, `Result.deserialize`, or `Result.hydrate` call.

## 1. Find the boundary contract

For each call, trace the serialized value to its consumer or producer. Record:

- the in-memory Ok and Err payload types
- the wire/storage Ok and Err payload shapes
- whether either direction transforms values such as `Date`, branded values, or error classes
- who handles malformed envelopes and payloads
- whether the chosen Standard Schema validators are synchronous or asynchronous

A boundary contract is the application operation being transported or persisted, not the transport mechanism. For RPC, treat each method with a different success schema as a distinct contract even when every method shares one error union. A generic `unknown`/`structuredClone` schema only proves cloneability: it duplicates transport work and misses the method's payload contract.

Create one named codec per contract. Reuse a codec only where all four payload contracts are identical. Share validated schema fragments, a private codec factory, and common codec-error policy where contracts overlap.

Scope this migration branch to boundaries that relied on the removed Result helpers. Leave unrelated generic RPC/decorator boundaries on their existing serialization path unless their payload contract independently requires a v3 codec.

## 2. Define all four schemas

`Result.codec` requires an Ok and Err schema for both directions. Define and name those schemas outside the codec declaration:

```ts
import { Result, ResultDeserializationError } from "better-result";

const UserResultCodec = Result.codec({
  serialize: {
    ok: UserToWireSchema,
    err: ValidationErrorToWireSchema,
  },
  deserialize: {
    ok: UserFromWireSchema,
    err: ValidationErrorFromWireSchema,
  },
});
```

Identity-like schemas must still validate. Prefer the repository's existing payload schemas over parallel codec-only definitions. When in-memory and wire types differ, implement that mapping inside each named directional schema rather than casting the envelope or embedding schema construction in `Result.codec`.

### Share mechanics without erasing contracts

When operations share some payload schemas, reuse those schemas directly or through a private codec factory. Keep a named codec for each unique four-schema contract. Generic helpers may centralize serialization, deserialization, or codec-error policy when they accept the owning codec or its operation result and preserve its inferred payload types.

### Reconstruct domain errors

The Err deserialization schema must transform a valid wire error into the corresponding domain error instance. Discriminate the wire error by its tag or code and construct the matching class. The decoded Result then contains domain errors, while `ResultDeserializationError` remains reserved for malformed envelopes or payloads.

## 3. Replace serialization

```ts
// 2.x: cannot fail
const envelope = Result.serialize(result);

// 3.0: payload validation is explicit
const encoded = await UserResultCodec.serialize(result);
```

`encoded` is a `Result<SerializedResult<...>, ResultSerializationError>`. Keep it in Result composition or explicitly apply the producer boundary's existing transport-failure policy before sending/writing the envelope.

```ts
if (Result.isError(encoded)) {
  reportInvalidOutboundPayload(encoded.error.value, encoded.error.issues);
  throw encoded.error; // Preserve this RPC producer's rejected-transport behavior.
}

await transport.send(encoded.value);
```

Throwing is appropriate only where outbound contract defects previously rejected the RPC or write. If the boundary already returns typed infrastructure failures, translate `ResultSerializationError` into that type instead. Centralize this policy in a typed helper when many producers use the same behavior; pass each method's named codec result into the helper.

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

Import `ResultDeserializationError` where the boundary distinguishes malformed input from a valid serialized Err payload. Translate it to the caller's parse/transport error at that boundary; preserve a valid decoded remote Err as the domain class produced by the Err schema.

```ts
const decoded = await GetQueueResultCodec.deserialize(input);

if (Result.isError(decoded) && ResultDeserializationError.is(decoded.error)) {
  return Result.err(new SongQueueParseError({ cause: decoded.error }));
}
return decoded; // Ok payload or reconstructed remote domain Err.
```

A shared inbound helper may perform this malformed-payload translation, but it must preserve the codec's method-specific Ok type and domain Err union.

## 5. Preserve honest sync/async behavior

Each selected schema determines whether that branch's operation returns `Result` or `Promise<Result>`. Mixed schema configurations can produce `Result | Promise<Result>` when the branch is not statically known. `await` accepts both and is the simplest boundary control flow when callers do not need a synchronous contract.

A schema that reports issues yields `ResultSerializationError` or `ResultDeserializationError`. A schema that throws or rejects is a defect and becomes `Panic`; preserve the repository's defect reporting behavior.

JSON omits properties with `undefined` values. A codec accepts `{ status: "ok" }` or `{ status: "error" }` and passes `undefined` to the selected deserialization schema. Use a schema that accepts `undefined` for `void`/`undefined` payloads; other schemas correctly return `ResultDeserializationError`.

## Completion check

The serialization branch is complete when every old helper call is gone; each distinct method/boundary contract has four validating schemas; shared factories and helpers preserve method-specific types; wire errors become domain error instances; codec failures follow explicit producer and consumer policies; and async behavior is reflected in callers and tests.
