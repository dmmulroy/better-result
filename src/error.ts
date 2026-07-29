import { dual } from "./dual";
import { err, panic, type Err } from "./core";
import { type StandardSchemaV1 } from "./standard-schema";

/** Serialize cause for JSON output */
const serializeCause = (cause: unknown): unknown => {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
};

/** Tagged error-like value (for generic constraints). */
type TaggedErrorLike = Error & { readonly _tag: string };

/** Any TaggedError instance. */
export type AnyTaggedError = TaggedErrorLike & { toJSON(): object };

/** Type guard for any TaggedError instance. */
const isAnyTaggedError = (value: unknown): value is AnyTaggedError => {
  return (
    value instanceof Error &&
    "_tag" in value &&
    typeof value._tag === "string" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
};

/**
 * Factory for tagged error classes.
 *
 * @example
 * class NotFoundError extends TaggedError("NotFoundError")<{
 *   id: string;
 *   message: string;
 * }> {}
 *
 * const err = new NotFoundError({ id: "123", message: "Not found: 123" });
 * err._tag    // "NotFoundError"
 * err.id      // "123"
 * err.message // "Not found: 123"
 *
 * // Check if any tagged error
 * TaggedError.is(err) // true
 */
export const TaggedError = <Tag extends string>(tag: Tag): TaggedErrorClass<Tag> => {
  class Base<Props extends Record<string, unknown> = {}> extends Error {
    readonly _tag: Tag = tag;

    constructor(args?: Props) {
      const message =
        args && "message" in args && typeof args.message === "string" ? args.message : undefined;
      const cause = args && "cause" in args ? args.cause : undefined;

      super(message, cause !== undefined ? { cause } : undefined);

      if (args) {
        Object.assign(this, args);
      }

      Object.setPrototypeOf(this, new.target.prototype);
      this.name = tag;

      if (cause instanceof Error && cause.stack) {
        const indented = cause.stack.replace(/\n/g, "\n  ");
        this.stack = `${this.stack}\nCaused by: ${indented}`;
      }
    }

    toJSON(): object {
      return {
        ...this,
        _tag: this._tag,
        name: this.name,
        message: this.message,
        cause: serializeCause(this.cause),
        stack: this.stack,
      };
    }

    /**
     * Makes this TaggedError yieldable in Result.gen blocks.
     * Yielding short-circuits with this error, matching Err semantics.
     */
    *[Symbol.iterator](): Generator<Err<never, this>, never, unknown> {
      yield* err(this);
      return panic("Unreachable: Err yielded in TaggedError but generator continued", this);
    }

    /** Type guard for the concrete error class on which this method is called. */
    static is<C extends TaggedErrorConstructor>(this: C, value: unknown): value is InstanceType<C> {
      return value instanceof this;
    }
  }

  // SAFETY: Cast needed for factory pattern - Props are assigned via Object.assign
  return Base as unknown as TaggedErrorClass<Tag>;
};
TaggedError.is = isAnyTaggedError;

interface IterableError extends Error {
  /** Makes TaggedError instances yieldable in Result.gen blocks. */
  [Symbol.iterator](): Generator<Err<never, this>, never, unknown>;
}

/** Instance type produced by TaggedError factory */
export type TaggedErrorInstance<Tag extends string, Props> = IterableError & {
  readonly _tag: Tag;
  toJSON(): object;
} & Readonly<Props>;

/** Constructor used to infer the concrete class for static TaggedError guards. */
type TaggedErrorConstructor = abstract new (...args: never[]) => object;

/** Class type produced by TaggedError factory */
export type TaggedErrorClass<Tag extends string> = {
  new <Props extends Record<string, unknown> = {}>(
    ...args: keyof Props extends never ? [args?: {}] : [args: Props]
  ): TaggedErrorInstance<Tag, Props>;
  /** Type guard for the concrete error class on which this method is called. */
  is<C extends TaggedErrorConstructor>(this: C, value: unknown): value is InstanceType<C>;
};

/** Handler map for exhaustive matching */
type MatchHandlers<E extends TaggedErrorLike, R> = {
  [K in E["_tag"]]: (err: Extract<E, { _tag: K }>) => R;
};

/** Partial handler map for non-exhaustive matching */
type PartialMatchHandlers<E extends TaggedErrorLike, R> = Partial<MatchHandlers<E, R>>;

/** Extract handled tags from a handlers object */
type HandledTags<E extends TaggedErrorLike, H> = Extract<keyof H, E["_tag"]>;

/**
 * Exhaustive pattern match on tagged error union.
 *
 * @example
 * // Data-first
 * matchError(err, {
 *   NotFoundError: (e) => `Missing: ${e.id}`,
 *   ValidationError: (e) => `Invalid: ${e.field}`,
 * });
 *
 * // Data-last (pipeable)
 * pipe(err, matchError({
 *   NotFoundError: (e) => `Missing: ${e.id}`,
 *   ValidationError: (e) => `Invalid: ${e.field}`,
 * }));
 */
export const matchError: {
  <E extends TaggedErrorLike, R>(handlers: MatchHandlers<E, R>): (err: E) => R;
  <E extends TaggedErrorLike, R>(err: E, handlers: MatchHandlers<E, R>): R;
} = dual(2, <E extends TaggedErrorLike, R>(err: E, handlers: MatchHandlers<E, R>): R => {
  const handler = handlers[err._tag as E["_tag"]];
  // SAFETY: handler exists if handlers satisfies MatchHandlers<E, R>
  return handler(err as Extract<E, { _tag: (typeof err)["_tag"] }>);
});

/**
 * Partial pattern match with fallback for unhandled tags.
 *
 * @example
 * matchErrorPartial(err, {
 *   NotFoundError: (e) => `Missing: ${e.id}`,
 * }, (e) => `Unknown: ${e.message}`);
 */
export const matchErrorPartial: {
  <
    E extends TaggedErrorLike,
    R,
    const H extends PartialMatchHandlers<E, R> = PartialMatchHandlers<E, R>,
  >(
    handlers: H,
    fallback: (e: Exclude<E, { _tag: NoInfer<HandledTags<E, H>> }>) => R,
  ): (err: E) => R;
  <E extends TaggedErrorLike, R, const H extends PartialMatchHandlers<E, R>>(
    err: E,
    handlers: H,
    fallback: (e: Exclude<E, { _tag: NoInfer<HandledTags<E, H>> }>) => R,
  ): R;
} = dual(
  3,
  <E extends TaggedErrorLike, R, H extends PartialMatchHandlers<E, R>>(
    err: E,
    handlers: H,
    fallback: (e: Exclude<E, { _tag: HandledTags<E, H> }>) => R,
  ): R => {
    type K = HandledTags<E, H>;
    const handler = handlers[err._tag as K];
    if (typeof handler === "function") {
      // SAFETY: handler exists and matches the tag
      return handler(err as Parameters<NonNullable<typeof handler>>[0]);
    }
    // SAFETY: If no handler matched, err is in the Exclude type
    return fallback(err as Exclude<E, { _tag: K }>);
  },
);

/**
 * Type guard for tagged error instances.
 *
 * @example
 * if (isTaggedError(value)) { value._tag; value.toJSON(); }
 */
export const isTaggedError = isAnyTaggedError;

/**
 * Wraps exceptions caught by Result.try/tryPromise.
 * Custom constructor derives message from cause.
 */
export class UnhandledException extends TaggedError("UnhandledException")<{
  message: string;
  cause: unknown;
}> {
  constructor(args: { cause: unknown }) {
    const message =
      args.cause instanceof Error
        ? `Unhandled exception: ${args.cause.message}`
        : `Unhandled exception: ${String(args.cause)}`;
    super({ message, cause: args.cause });
  }
}

/** A Standard Schema validation issue reported while encoding or decoding a Result payload. */
export type ResultCodecIssue = StandardSchemaV1.Issue;

/**
 * Returned when Result codec deserialization receives an invalid envelope or payload.
 *
 * @example
 * const result = UserResultCodec.deserialize(invalidData);
 * if (Result.isError(result) && ResultDeserializationError.is(result.error)) {
 *   console.log("Invalid input:", result.error.value);
 * }
 */
export class ResultDeserializationError extends TaggedError("ResultDeserializationError")<{
  message: string;
  value: unknown;
  issues?: ReadonlyArray<ResultCodecIssue>;
}> {
  constructor(args: { value: unknown; issues?: ReadonlyArray<ResultCodecIssue> }) {
    super({
      message: args.issues
        ? "Failed to deserialize Result payload"
        : `Failed to deserialize value as Result: expected { status: "ok", value } or { status: "error", error }`,
      value: args.value,
      issues: args.issues,
    });
  }
}

/**
 * Returned when a Result codec cannot serialize an Ok or Err payload.
 *
 * @example
 * const result = UserResultCodec.serialize(Result.ok(value));
 * if (Result.isError(result) && ResultSerializationError.is(result.error)) {
 *   console.log("Invalid output:", result.error.value);
 * }
 */
export class ResultSerializationError extends TaggedError("ResultSerializationError")<{
  message: string;
  value: unknown;
  issues?: ReadonlyArray<ResultCodecIssue>;
}> {
  constructor(args: { value: unknown; issues?: ReadonlyArray<ResultCodecIssue> }) {
    super({
      message: "Failed to serialize Result payload",
      value: args.value,
      issues: args.issues,
    });
  }
}

export { Panic, isPanic, panic } from "./core";
