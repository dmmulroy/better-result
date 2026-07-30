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

    /** Exhaustively matches a tagged error union and returns the selected handler's result. */
    match<E extends TaggedErrorLike, const H extends MatchHandlers<E>>(
      this: E,
      handlers: H,
    ): MatchReturn<H>;
    /** Exhaustively matches a tagged error union while constraining every handler to return `R`. */
    match<E extends TaggedErrorLike, R>(this: E, handlers: MatchHandlersWithReturn<E, R>): R;
    match<E extends TaggedErrorLike>(this: E, handlers: MatchHandlers<E>): unknown {
      return matchError(this, handlers);
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

interface TaggedErrorMethods extends Error {
  /** Exhaustively matches a tagged error union and returns the selected handler's result. */
  match<E extends TaggedErrorLike, const H extends MatchHandlers<E>>(
    this: E,
    handlers: H,
  ): MatchReturn<H>;
  /** Exhaustively matches a tagged error union while constraining every handler to return `R`. */
  match<E extends TaggedErrorLike, R>(this: E, handlers: MatchHandlersWithReturn<E, R>): R;

  /** Makes TaggedError instances yieldable in Result.gen blocks. */
  [Symbol.iterator](): Generator<Err<never, this>, never, unknown>;
}

/** Instance type produced by TaggedError factory */
export type TaggedErrorInstance<Tag extends string, Props> = TaggedErrorMethods & {
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

/** Handler map for exhaustive matching (returns inferred per-handler) */
type MatchHandlers<E extends TaggedErrorLike> = {
  [K in E["_tag"]]: (err: Extract<E, { _tag: K }>) => unknown;
};

/** Handler map constraining every handler to return `R` */
type MatchHandlersWithReturn<E extends TaggedErrorLike, R> = {
  [K in E["_tag"]]: (err: Extract<E, { _tag: K }>) => R;
};

/** Union of every handler's return type */
type MatchReturn<H> = {
  [K in keyof H]: H[K] extends (err: never) => infer R ? R : never;
}[keyof H];

/** Partial handler map for non-exhaustive matching */
type PartialMatchHandlers<E extends TaggedErrorLike, R> = Partial<MatchHandlersWithReturn<E, R>>;

/** Deferred handlers with explicitly annotated concrete error parameters. */
type AnnotatedMatchHandlers = Record<string, (err: never) => unknown>;

/** Ensure each annotated handler parameter accepts the tag represented by its key. */
type ValidateAnnotatedMatchHandlers<H extends AnnotatedMatchHandlers> = {
  [K in keyof H]: H[K] extends (err: infer E extends TaggedErrorLike) => unknown
    ? Extract<K, string> extends E["_tag"]
      ? H[K]
      : never
    : never;
};

/** Extract handled tags from a handlers object */
type HandledTags<E extends TaggedErrorLike, H> = Extract<keyof H, E["_tag"]>;

/** Error variants not selected by a partial handler map. */
type UnhandledMatchErrors<E extends TaggedErrorLike, H> = Exclude<E, { _tag: HandledTags<E, H> }>;

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
  /** Data-last, E deferred to application; returns the union of handler returns */
  <H extends MatchHandlers<TaggedErrorLike>>(
    handlers: H,
  ): <E extends TaggedErrorLike & { _tag: keyof H }>(err: E) => MatchReturn<H>;
  /** Data-last with explicit E, R constraining every handler return */
  <E extends TaggedErrorLike, R>(handlers: MatchHandlersWithReturn<E, R>): (err: E) => R;
  /** Data-first, inferred; returns the union of handler returns */
  <E extends TaggedErrorLike, H extends MatchHandlers<E>>(err: E, handlers: H): MatchReturn<H>;
  /** Data-first with explicit R constraining every handler return */
  <E extends TaggedErrorLike, R>(err: E, handlers: MatchHandlersWithReturn<E, R>): R;
} = dual(2, <E extends TaggedErrorLike>(err: E, handlers: MatchHandlers<E>): unknown => {
  const handler = handlers[err._tag as E["_tag"]];
  // SAFETY: exhaustiveness is enforced at the type level
  return handler(err as Extract<E, { _tag: (typeof err)["_tag"] }>);
});

const returnTaggedErrorIdentity = (error: TaggedErrorLike): TaggedErrorLike => error;

const applyMatchErrorPartial = (
  err: TaggedErrorLike,
  handlers: Partial<MatchHandlers<TaggedErrorLike>>,
  onUnhandled: (e: TaggedErrorLike) => unknown,
): unknown => {
  const handler = Object.hasOwn(handlers, err._tag) ? handlers[err._tag] : undefined;
  if (typeof handler === "function") {
    return handler(err);
  }
  return onUnhandled(err);
};

/**
 * Partially matches tagged errors, returning unhandled errors unchanged by default.
 * Passing `Result.err` as the pipeable `onUnhandled` callback preserves unhandled variants.
 *
 * @example
 * const transformed = matchErrorPartial(err, {
 *   NotFoundError: (e) => `Missing: ${e.id}`,
 * });
 *
 * // Annotate variant-specific handlers when using the pipeable form.
 * const transformError = matchErrorPartial({
 *   NotFoundError: (e: NotFoundError) => `Missing: ${e.id}`,
 * });
 *
 * // Supply an onUnhandled callback to transform unhandled errors instead.
 * const message = matchErrorPartial(
 *   err,
 *   { NotFoundError: (e) => `Missing: ${e.id}` },
 *   (e) => `Unknown: ${e.message}`,
 * );
 */
export function matchErrorPartial<const H extends AnnotatedMatchHandlers>(
  handlers: H & ValidateAnnotatedMatchHandlers<H>,
  onUnhandled: typeof err,
): <E extends TaggedErrorLike>(error: E) => MatchReturn<H> | Err<never, UnhandledMatchErrors<E, H>>;
/** Pipeable with a general onUnhandled callback while deferring E until application. */
export function matchErrorPartial<H extends Partial<MatchHandlers<TaggedErrorLike>>, R>(
  handlers: H,
  onUnhandled: (error: TaggedErrorLike) => R,
): <E extends TaggedErrorLike>(error: E) => MatchReturn<H> | R;
/** Pipeable with explicit E, R — H inferred via default, onUnhandled narrowed */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  R,
  const H extends PartialMatchHandlers<E, R> = PartialMatchHandlers<E, R>,
>(
  handlers: H,
  onUnhandled: (error: Exclude<E, { _tag: NoInfer<HandledTags<E, H>> }>) => R,
): (error: E) => R;
/** Pipeable with identity onUnhandled behavior — E is deferred until application */
export function matchErrorPartial<const H extends Partial<MatchHandlers<TaggedErrorLike>>>(
  handlers: H,
): <E extends TaggedErrorLike>(err: E) => MatchReturn<H> | UnhandledMatchErrors<E, H>;
/** Pipeable with annotated handler parameters and identity onUnhandled behavior */
export function matchErrorPartial<const H extends AnnotatedMatchHandlers>(
  handlers: H & ValidateAnnotatedMatchHandlers<H>,
): <E extends TaggedErrorLike>(err: E) => MatchReturn<H> | UnhandledMatchErrors<E, H>;
/** Pipeable with explicit E, R and identity onUnhandled behavior; E remains conservative */
export function matchErrorPartial<E extends TaggedErrorLike, R>(
  handlers: PartialMatchHandlers<E, R>,
): (err: E) => R | E;
/** Pipeable with exact H and identity onUnhandled behavior; handled variants are excluded */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  R,
  const H extends PartialMatchHandlers<E, R>,
>(handlers: H): (err: E) => R | UnhandledMatchErrors<E, H>;
/** Data-first with identity onUnhandled behavior; returns results or unhandled variants */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  const H extends Partial<MatchHandlers<E>>,
>(err: E, handlers: H): MatchReturn<H> | UnhandledMatchErrors<E, H>;
/** Data-first with explicit E, R and identity onUnhandled behavior; E remains conservative */
export function matchErrorPartial<E extends TaggedErrorLike, R>(
  err: E,
  handlers: PartialMatchHandlers<E, R>,
): R | E;
/** Data-first with exact H and identity onUnhandled behavior; handled variants are excluded */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  R,
  const H extends PartialMatchHandlers<E, R>,
>(err: E, handlers: H): R | UnhandledMatchErrors<E, H>;
/** Data-first with inference — E from error, H from handlers, R from onUnhandled */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  const H extends Partial<MatchHandlers<E>>,
  R,
>(
  error: E,
  handlers: H,
  onUnhandled: (error: Exclude<E, { _tag: NoInfer<HandledTags<E, H>> }>) => R,
): MatchReturn<H> | R;
/** Data-first with explicit R — H inferred via default, onUnhandled narrowed */
export function matchErrorPartial<
  E extends TaggedErrorLike,
  R,
  const H extends PartialMatchHandlers<E, R> = PartialMatchHandlers<E, R>,
>(
  error: E,
  handlers: H,
  onUnhandled: (error: Exclude<E, { _tag: NoInfer<HandledTags<E, H>> }>) => R,
): R;
export function matchErrorPartial(
  errorOrHandlers: TaggedErrorLike | Partial<MatchHandlers<TaggedErrorLike>>,
  handlersOrOnUnhandled?:
    | Partial<MatchHandlers<TaggedErrorLike>>
    | ((error: TaggedErrorLike) => unknown),
  onUnhandled?: (error: TaggedErrorLike) => unknown,
): unknown {
  if (typeof handlersOrOnUnhandled === "function") {
    // SAFETY: In the two-argument pipeable overload, the first argument is the handler map.
    const handlers = errorOrHandlers as Partial<MatchHandlers<TaggedErrorLike>>;
    return (error: TaggedErrorLike): unknown =>
      applyMatchErrorPartial(error, handlers, handlersOrOnUnhandled);
  }

  if (handlersOrOnUnhandled === undefined) {
    // SAFETY: In the one-argument pipeable overload, the first argument is the handler map.
    const handlers = errorOrHandlers as Partial<MatchHandlers<TaggedErrorLike>>;
    return (error: TaggedErrorLike): unknown =>
      applyMatchErrorPartial(error, handlers, returnTaggedErrorIdentity);
  }

  // SAFETY: In data-first overloads, the first argument is the tagged error.
  const error = errorOrHandlers as TaggedErrorLike;
  return applyMatchErrorPartial(
    error,
    handlersOrOnUnhandled,
    onUnhandled ?? returnTaggedErrorIdentity,
  );
}

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
