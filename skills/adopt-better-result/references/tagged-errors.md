# Tagged errors and messages

## Give every known failure a name

Create a custom `TaggedError` for every distinct known recoverable failure. The tag and class name should describe the failed domain operation or condition, not merely repeat an underlying library's error name. Reuse a class only for repeated occurrences of the same failure.

Each error should carry the structured context needed to debug and handle it:

- relevant domain identifiers and operation names
- safe input facts and upstream status or error codes
- retry or remediation facts when applicable
- a specific developer-facing `message`
- the original `cause` when wrapping another failure

Keep context structured instead of embedding everything in the message. Exclude credentials, tokens, raw personal data, SQL, and other secrets.

```ts
import { TaggedError } from "better-result";

class LoadCustomerProfileError extends TaggedError("LoadCustomerProfileError")<{
  customerId: string;
  provider: string;
  message: string;
  cause: unknown;
}> {
  constructor(args: { customerId: string; provider: string; cause: unknown }) {
    super({
      ...args,
      message: `Unable to load customer profile ${args.customerId} from ${args.provider}; the provider request failed. Retry the request or inspect the attached cause.`,
    });
  }
}
```

Verify syntax against the installed `better-result` version before copying an example.

## Write useful messages

Both internal and user-facing messages should communicate the facts available at that boundary:

1. what happened
2. the known cause
3. the impact, including what remained safe
4. the next action
5. an established help channel when one exists

Internal messages use precise technical context and remediation. User-facing messages use plain language and safe details. Name the failed operation and next action when they are known.

Keep the detailed internal message on the tagged error. Create the user-safe message at the presentation boundary with exhaustive error matching, unless the repository has an established equivalent pattern. This keeps internal details from leaking and lets each interface choose suitable wording.

## Separate recoverable failures from defects

Use these dispositions:

- **Recoverable:** return a custom `TaggedError` for a known failure callers can report, retry, compensate for, or otherwise handle.
- **Defect:** surface a `Panic`, normally with `panic(message, cause)`, for a violated invariant, impossible state, invalid internal assumption, or programmer mistake.
- **Unknown external exception:** inspect the dependency contract. Map a documented operational failure to a specific boundary error; track temporary `UnhandledException` use for unresolved exceptions.
- **Unknown:** record what evidence or contract must be investigated before choosing a disposition.

A rare operational failure remains recoverable when the caller has a meaningful response. Make panic messages state the invariant, observed state, and operation in progress. Preserve causes and let panics reach the outermost telemetry or crash boundary.

Record every `UnhandledException` fallback in the adoption report or implementation summary so its required investigation remains visible.

## Design for handling

Use discriminated error unions and exhaustive matching at decision boundaries. Prefer the `error.match({ ... })` instance method when every variant is created by `TaggedError`; its receiver supplies the complete error union and each handler narrows to its concrete variant. Use the standalone `matchError(error, handlers)` function for structurally tagged errors or its data-last form.

```ts
const response = result.match({
  ok: (user) => ({ status: 200, body: user }),
  err: (error) =>
    error.match({
      UserNotFound: () => ({ status: 404, body: null }),
      UserStoreUnavailable: () => ({ status: 503, body: null }),
    }),
});
```

Error fields should provide the facts required for retries, status mapping, compensation, logging, and user presentation without parsing the message string. Treat `match` as a reserved TaggedError instance method; TypeScript rejects payload properties and incompatible subclass members with that name. If an exhaustive `.match()` or `matchError` handler throws, the operation throws `Panic` with the original exception as `cause`.

For errors crossing serialized boundaries, apply [`result-boundaries.md`](result-boundaries.md). Expose stable public codes and safe fields; reconstruct the appropriate tagged error during trusted deserialization when the receiving side needs domain behavior.
