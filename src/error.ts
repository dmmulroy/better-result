import { dual } from "./dual";

/** Serialize cause for JSON output */
const serializeCause = (cause: unknown): unknown => {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
};

/** Any tagged error (for generic constraints) */
type AnyTaggedError = Error & { readonly _tag: string };

/** Type guard for any tagged error */
const isAnyTaggedError = (value: unknown): value is AnyTaggedError => {
  return value instanceof Error && "_tag" in value && typeof value._tag === "string";
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
export const TaggedError: {
  <Tag extends string>(tag: Tag): <Props extends Record<string, unknown> = {}>() => TaggedErrorClass<
    Tag,
    Props
  >;
  /** Type guard for any TaggedError instance */
  is(value: unknown): value is AnyTaggedError;
} = Object.assign(
  <Tag extends string>(tag: Tag) =>
  <Props extends Record<string, unknown> = {}>(): TaggedErrorClass<Tag, Props> => {
    class Base extends Error {
      readonly _tag: Tag = tag;

      /** Type guard for this error class */
      static is(value: unknown): value is Base {
        return value instanceof Base;
      }

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
    }

    // SAFETY: Cast needed for factory pattern - Props are assigned via Object.assign
    return Base as unknown as TaggedErrorClass<Tag, Props>;
  },
  { is: isAnyTaggedError },
);

/** Instance type produced by TaggedError factory */
export type TaggedErrorInstance<Tag extends string, Props> = Error & {
  readonly _tag: Tag;
  toJSON(): object;
} & Readonly<Props>;

/** Class type produced by TaggedError factory */
export type TaggedErrorClass<Tag extends string, Props> = {
  new (...args: keyof Props extends never ? [args?: {}] : [args: Props]): TaggedErrorInstance<
    Tag,
    Props
  >;
  /** Type guard for this error class */
  is(value: unknown): value is TaggedErrorInstance<Tag, Props>;
};

/** Handler map for exhaustive matching */
type MatchHandlers<E extends AnyTaggedError, R> = {
  [K in E["_tag"]]: (err: Extract<E, { _tag: K }>) => R;
};

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
  <E extends AnyTaggedError, R>(err: E, handlers: MatchHandlers<E, R>): R;
  <E extends AnyTaggedError, R>(handlers: MatchHandlers<E, R>): (err: E) => R;
} = dual(
  2,
  <E extends AnyTaggedError, R>(err: E, handlers: MatchHandlers<E, R>): R => {
    const handler = handlers[err._tag as E["_tag"]];
    // SAFETY: handler exists if handlers satisfies MatchHandlers<E, R>
    return handler(err as Extract<E, { _tag: (typeof err)["_tag"] }>);
  },
);

/**
 * Partial pattern match with fallback for unhandled tags.
 *
 * @example
 * matchErrorPartial(err, {
 *   NotFoundError: (e) => `Missing: ${e.id}`,
 * }, (e) => `Unknown: ${e.message}`);
 */
export const matchErrorPartial: {
  <E extends AnyTaggedError, R>(
    err: E,
    handlers: Partial<MatchHandlers<E, R>>,
    fallback: (e: E) => R,
  ): R;
  <E extends AnyTaggedError, R>(
    handlers: Partial<MatchHandlers<E, R>>,
    fallback: (e: E) => R,
  ): (err: E) => R;
} = dual(
  3,
  <E extends AnyTaggedError, R>(
    err: E,
    handlers: Partial<MatchHandlers<E, R>>,
    fallback: (e: E) => R,
  ): R => {
    const handler = handlers[err._tag as E["_tag"]];
    if (handler) {
      // SAFETY: handler exists and matches the tag
      return handler(err as Extract<E, { _tag: (typeof err)["_tag"] }>);
    }
    return fallback(err);
  },
);

/**
 * Type guard for tagged error instances.
 *
 * @example
 * if (isTaggedError(value)) { value._tag }
 */
export const isTaggedError = isAnyTaggedError;

/**
 * Wraps exceptions caught by Result.try/tryPromise.
 * Custom constructor derives message from cause.
 */
export class UnhandledException extends TaggedError("UnhandledException")<{
  message: string;
  cause: unknown;
}>() {
  constructor(args: { cause: unknown }) {
    const message =
      args.cause instanceof Error
        ? `Unhandled exception: ${args.cause.message}`
        : `Unhandled exception: ${String(args.cause)}`;
    super({ message, cause: args.cause });
  }
}

/**
 * Unrecoverable error — user code threw inside Result operations.
 *
 * @example
 * // Panic in generator cleanup:
 * Result.gen(function* () {
 *   try {
 *     yield* Result.err("expected error");
 *   } finally {
 *     throw new Error("cleanup failed");  // Panic!
 *   }
 * });
 *
 * // Panic in combinator:
 * Result.ok(1).map(() => { throw new Error("oops"); });  // Panic!
 */
export class Panic extends TaggedError("Panic")<{
  message: string;
  cause?: unknown;
}>() {}

/**
 * Type guard for Panic instances.
 *
 * @example
 * if (isPanic(value)) { value.cause }
 */
export const isPanic = (value: unknown): value is Panic => {
  return value instanceof Panic;
};

/**
 * Throw an unrecoverable Panic.
 *
 * @example
 * panic("something went wrong", cause);
 */
export const panic = (message: string, cause?: unknown): never => {
  throw new Panic({ message, cause });
};
