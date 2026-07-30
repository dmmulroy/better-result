# Result boundaries and codecs

## Decide where Result ends

Use `Result<T, E>` for in-process recoverable control flow. Plain in-process calls do not need serialization.

Use `Result.codec` whenever a `Result` is serialized across a boundary or received from untrusted data, including:

- HTTP and RPC
- server actions
- queues and event payloads
- workers and cross-process messages
- persistence or caches that store Result envelopes

Filesystem, database, subprocess, HTTP-client, and SDK calls are also failure-producing boundaries. Wrap their known operational failures in specific tagged errors even when no Result envelope crosses them.

## Define an explicit wire contract

Create one named codec for each boundary contract. Its Standard Schema-compatible schemas must:

- serialize both success and error payloads
- validate the outer Result envelope and selected payload
- expose stable wire tags/codes and safe fields
- transform dates, classes, and other non-JSON runtime values explicitly
- reconstruct domain values and tagged errors when deserializing into trusted code
- reject unknown or malformed payloads rather than asserting their types

Expose only stable public codes and safe fields in public wire errors. Define an explicit public contract with dedicated schemas.

```ts
const CustomerResultCodec = Result.codec({
  serialize: {
    ok: CustomerToWireSchema,
    err: CustomerErrorToWireSchema,
  },
  deserialize: {
    ok: WireToCustomerSchema,
    err: WireToCustomerErrorSchema,
  },
});
```

Verify exact APIs against the installed version. Codec serialization can return `ResultSerializationError`; deserialization can return `ResultDeserializationError`. Add both to the boundary's handling design. Schema implementations that throw or reject are defects and surface as `Panic`.

## Audit both sides

For each boundary, identify the producer and every consumer. Confirm they agree on:

- envelope shape and versioning
- error discriminants and safe metadata
- sync or async codec behavior
- malformed-payload behavior
- retry and idempotency expectations
- user-facing status/message mapping

Test successful and failed round trips, each error variant, malformed envelopes, malformed payloads, and removal of sensitive fields.
