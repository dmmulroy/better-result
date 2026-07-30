import { describe, expectTypeOf, it } from "vitest";
import { type Err, matchError, matchErrorPartial, type Ok, Result, TaggedError } from "./index";

class ErrorA extends TaggedError("ErrorA")<{}> {}
class ErrorB extends TaggedError("ErrorB")<{}> {}
class ErrorC extends TaggedError("ErrorC")<{}> {}
class DetailedError extends TaggedError("DetailedError")<{ detail: string }> {}

// @ts-expect-error - match is reserved for the exhaustive instance method
class ReservedMatchPropertyError extends TaggedError("ReservedMatchPropertyError")<{
  match: string;
}> {}

// @ts-expect-error - match is reserved even when the payload value is undefined
class UndefinedReservedMatchPropertyError extends TaggedError(
  "UndefinedReservedMatchPropertyError",
)<{
  match: undefined;
}> {}

void ReservedMatchPropertyError;
void UndefinedReservedMatchPropertyError;

class StructuralTaggedError extends Error {
  readonly _tag = "StructuralTaggedError";
}

type HttpErrorResponse = {
  readonly status: number;
  readonly message: string;
};

describe("TaggedError.match", () => {
  it("infers the error union and divergent handler returns from the receiver", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = result.error.match({
      ErrorA: (_error) => 1,
      ErrorB: (_error) => "B",
    });

    expectTypeOf(outcome).toEqualTypeOf<number | string>();
  });

  it("composes directly inside a Result error handler", () => {
    const result = Result.err<{ readonly id: string }, ErrorA | ErrorB>(new ErrorA());
    const outcome = result.match({
      ok: () => 200 as const,
      err: (error) =>
        error.match({
          ErrorA: () => 400 as const,
          ErrorB: () => 503 as const,
        }),
    });

    expectTypeOf(outcome).toEqualTypeOf<200 | 400 | 503>();
  });

  it("narrows every handler parameter to its tagged error variant", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());

    result.error.match({
      ErrorA: (error) => expectTypeOf(error).toEqualTypeOf<ErrorA>(),
      ErrorB: (error) => expectTypeOf(error).toEqualTypeOf<ErrorB>(),
    });
  });

  it("requires every error union variant to have a handler", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());

    // @ts-expect-error - ErrorB handler is missing
    result.error.match({
      ErrorA: (_error) => 1,
    });
  });

  it("rejects properties from another error variant in a narrowed handler", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());

    result.error.match({
      ErrorA: (error) => {
        // @ts-expect-error - ErrorA does not have DetailedError properties
        return error.detail;
      },
      ErrorB: (_error) => "B",
    });
  });

  it("requires only the concrete receiver's handler", () => {
    const error = new DetailedError({ detail: "context" });
    const outcome = error.match({
      DetailedError: (selectedError) => selectedError.detail,
    });

    expectTypeOf(outcome).toBeString();
  });

  it("drops never contributed by a throwing handler", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = result.error.match({
      ErrorA: (_error) => 1,
      ErrorB: (error) => {
        throw error;
      },
    });

    expectTypeOf(outcome).toBeNumber();
  });

  it("infers never when every handler throws", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = result.error.match({
      ErrorA: (error) => {
        throw error;
      },
      ErrorB: (error) => {
        throw error;
      },
    });

    expectTypeOf(outcome).toBeNever();
  });

  it("supports an explicit error union and shared return type", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = result.error.match<ErrorA | ErrorB, string>({
      ErrorA: () => "A" as const,
      ErrorB: () => "B" as const,
    });

    expectTypeOf(outcome).toBeString();
  });

  it("uses an explicit return type to constrain every handler", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());

    result.error.match<ErrorA | ErrorB, string>({
      ErrorA: () => "A",
      // @ts-expect-error - number is not assignable to the explicit string return type
      ErrorB: () => 123,
    });
  });

  it("supports a concrete function return type when another handler throws", () => {
    const toHttpErrorResponse = (error: ErrorA | ErrorB): HttpErrorResponse =>
      error.match({
        ErrorA: () => ({ status: 400, message: "Invalid request" }),
        ErrorB: (selectedError) => {
          throw selectedError;
        },
      });

    expectTypeOf(toHttpErrorResponse).returns.toEqualTypeOf<HttpErrorResponse>();
  });
});

describe("matchError", () => {
  it("infers union from divergent handler returns", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError(result.error, {
      ErrorA: (_err) => 1,
      ErrorB: (_err) => "B",
    });
    expectTypeOf(outcome).toEqualTypeOf<number | string>();
  });

  it("drops `never` contributed by a throwing handler", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError(result.error, {
      ErrorA: (_err) => 1,
      ErrorB: (err) => {
        throw err;
      },
    });
    expectTypeOf(outcome).toEqualTypeOf<number>();
  });

  it("infers `never` when every handler throws", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError(result.error, {
      ErrorA: (err) => {
        throw err;
      },
      ErrorB: (err) => {
        throw err;
      },
    });
    expectTypeOf(outcome).toBeNever();
  });

  it("supports a concrete return type when other handlers throw", () => {
    const toHttpErrorResponse = (error: ErrorA | ErrorB): HttpErrorResponse =>
      matchError(error, {
        ErrorA: () => ({ status: 400, message: "Invalid request" }),
        ErrorB: (err) => {
          throw err;
        },
      });

    expectTypeOf(toHttpErrorResponse).returns.toEqualTypeOf<HttpErrorResponse>();
  });

  it("continues to support structurally tagged errors", () => {
    const error = new StructuralTaggedError("structural");
    const outcome = matchError(error, {
      StructuralTaggedError: () => "handled" as const,
    });
    expectTypeOf(outcome).toEqualTypeOf<"handled">();
  });

  it("narrows handler params to the matched error (data-first)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    matchError(result.error, {
      ErrorA: (e) => expectTypeOf(e).toEqualTypeOf<ErrorA>(),
      ErrorB: (e) => expectTypeOf(e).toEqualTypeOf<ErrorB>(),
    });
  });

  it("rejects a non-exhaustive handler map (data-first)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    // @ts-expect-error - ErrorB handler is missing
    matchError(result.error, {
      ErrorA: (_err) => 1,
    });
  });

  it("infers union from divergent handler returns data-last", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError({
      ErrorA: () => 1,
      ErrorB: () => "B",
    })(result.error);
    expectTypeOf(outcome).toEqualTypeOf<number | string>();
  });

  it("drops `never` data-last", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError({
      ErrorA: (_err) => "A" as const,
      ErrorB: (err) => {
        throw err;
      },
    })(result.error);
    expectTypeOf(outcome).toEqualTypeOf<"A">();
  });

  it("rejects a non-exhaustive handler map at application (data-last)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const matcher = matchError({
      ErrorA: (_err) => 1,
    });
    // @ts-expect-error - ErrorB is unhandled, so the error union is not exhaustively matched
    matcher(result.error);
  });

  it("accepts explicit type parameters", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError<ErrorA | ErrorB, string>(result.error, {
      ErrorA: (_err) => "A" as const,
      ErrorB: (_err) => "B" as const,
    });
    expectTypeOf(outcome).toBeString();
  });

  it("explicit R rejects a handler returning the wrong type", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    matchError<ErrorA | ErrorB, string>(result.error, {
      ErrorA: (_err) => "A",
      // @ts-expect-error - number is not assignable to string
      ErrorB: (_err) => 123,
    });
  });

  it("explicit R constrains all handler returns (data-last)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchError<ErrorA | ErrorB, string>({
      ErrorA: (_err) => "A" as const,
      ErrorB: (_err) => "B" as const,
    })(result.error);
    expectTypeOf(outcome).toBeString();
  });
});

describe("matchErrorPartial", () => {
  it("explicit R constrains all handler returns (data-first)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial<ErrorA | ErrorB, string>(
      result.error,
      {
        ErrorA: (_err) => "A" as const,
        ErrorB: (_err) => "B" as const,
      },
      (_err) => "fallback" as const,
    );
    expectTypeOf(outcome).toBeString();
  });

  it("explicit R rejects a handler returning the wrong type", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    matchErrorPartial<ErrorA | ErrorB, string>(
      result.error,
      {
        // @ts-expect-error - number is not assignable to string
        ErrorA: (_err) => 123,
      },
      (_err) => "fallback",
    );
  });

  it("explicit R rejects a fallback returning the wrong type", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    matchErrorPartial<ErrorA | ErrorB, string>(
      result.error,
      { ErrorA: () => "A" },
      // @ts-expect-error - number is not assignable to string
      (_err) => 123,
    );
  });

  it("explicit R constrains all handler returns (data-last)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial<ErrorA | ErrorB, string>(
      {
        ErrorA: (_err) => "A" as const,
        ErrorB: (_err) => "B" as const,
      },
      (_err) => "fallback" as const,
    )(result.error);
    expectTypeOf(outcome).toBeString();
  });

  it("infers union from divergent handler and fallback returns", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial(
      result.error,
      {
        ErrorA: (_err) => "specific" as const,
      },
      (_err) => 0,
    );
    expectTypeOf(outcome).toEqualTypeOf<"specific" | number>();
  });

  it("infers handler returns and unhandled errors with data-first identity fallback", () => {
    const result = Result.err<void, ErrorA | ErrorB | ErrorC>(new ErrorA());
    const outcome = matchErrorPartial(result.error, {
      ErrorA: (_err) => "handled" as const,
    });
    expectTypeOf(outcome).toEqualTypeOf<"handled" | ErrorB | ErrorC>();
  });

  it("infers handler returns and unhandled errors with data-last identity fallback", () => {
    const result = Result.err<void, ErrorA | ErrorB | ErrorC>(new ErrorA());
    const outcome = matchErrorPartial({
      ErrorA: (_err) => "handled" as const,
    })(result.error);
    expectTypeOf(outcome).toEqualTypeOf<"handled" | ErrorB | ErrorC>();
  });

  it("accepts a concrete handler annotation in data-last identity form", () => {
    const result = Result.err<void, DetailedError | ErrorB>(
      new DetailedError({ detail: "context" }),
    );
    const outcome = matchErrorPartial({
      DetailedError: (error: DetailedError) => Result.ok(error),
    })(result.error);

    expectTypeOf(outcome).toEqualTypeOf<Ok<DetailedError, never> | ErrorB>();
  });

  it("rejects a concrete handler annotation with a mismatched tag", () => {
    const result = Result.err<void, DetailedError | ErrorB>(
      new DetailedError({ detail: "context" }),
    );
    const matcher = matchErrorPartial({
      // @ts-expect-error - ErrorB does not accept the DetailedError tag
      DetailedError: (error: ErrorB) => Result.ok(error),
    });

    matcher(result.error);
  });

  it("infers the original error union for an empty identity handler map", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());

    expectTypeOf(matchErrorPartial(result.error, {})).toEqualTypeOf<ErrorA | ErrorB>();
    expectTypeOf(matchErrorPartial({})(result.error)).toEqualTypeOf<ErrorA | ErrorB>();
  });

  it("drops the identity branch when every error is handled", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial(result.error, {
      ErrorA: () => "A" as const,
      ErrorB: () => 2 as const,
    });
    expectTypeOf(outcome).toEqualTypeOf<"A" | 2>();
  });

  it("keeps E conservatively with explicit E and R for identity fallback", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const handlers = {
      ErrorA: () => "A",
    };

    const dataFirst = matchErrorPartial<ErrorA | ErrorB, string>(result.error, handlers);
    const dataLast = matchErrorPartial<ErrorA | ErrorB, string>(handlers)(result.error);
    expectTypeOf(dataFirst).toEqualTypeOf<string | ErrorA | ErrorB>();
    expectTypeOf(dataLast).toEqualTypeOf<string | ErrorA | ErrorB>();
  });

  it("excludes handled errors with explicit E, R, and H for identity fallback", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const handlers = {
      ErrorA: () => "A",
    };

    const dataFirst = matchErrorPartial<ErrorA | ErrorB, string, typeof handlers>(
      result.error,
      handlers,
    );
    const dataLast = matchErrorPartial<ErrorA | ErrorB, string, typeof handlers>(handlers)(
      result.error,
    );
    expectTypeOf(dataFirst).toEqualTypeOf<string | ErrorB>();
    expectTypeOf(dataLast).toEqualTypeOf<string | ErrorB>();
  });

  it("infers only the fallback return for an empty handler map", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial(result.error, {}, () => "fallback" as const);
    expectTypeOf(outcome).toEqualTypeOf<"fallback">();
  });

  it("continues to support structurally tagged errors", () => {
    const error = new StructuralTaggedError("structural");
    const outcome = matchErrorPartial(error, {}, () => "fallback" as const);
    expectTypeOf(outcome).toEqualTypeOf<"fallback">();
  });

  it("drops `never` from throwing handler and fallback", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial(
      result.error,
      {
        ErrorA: (_err) => "A" as const,
        ErrorB: (err) => {
          throw err;
        },
      },
      (err) => {
        throw err;
      },
    );
    expectTypeOf(outcome).toEqualTypeOf<"A">();
  });

  it("works data-last (pipeable)", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial(
      {
        ErrorA: (_err) => "A" as const,
        ErrorB: (err) => {
          throw err;
        },
      },
      (_err) => "fallback" as const,
    )(result.error);
    expectTypeOf(outcome).toEqualTypeOf<"A" | "fallback">();
  });

  it("accepts explicit type parameters", () => {
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matchErrorPartial<ErrorA | ErrorB, string>(
      result.error,
      {
        ErrorA: (_err) => "A" as const,
        ErrorB: (_err) => "B" as const,
      },
      (_err) => "fallback" as const,
    );
    expectTypeOf(outcome).toBeString();
  });

  it("narrows fallback type to exclude handled errors", () => {
    const result = Result.err<void, ErrorA | ErrorB | ErrorC>(new ErrorA());
    const outcome = matchErrorPartial(
      result.error,
      {
        ErrorA: (_err) => "A" as const,
      },
      (err) => {
        expectTypeOf(err).toEqualTypeOf<ErrorB | ErrorC>();
        return "fallback" as const;
      },
    );
    expectTypeOf(outcome).toEqualTypeOf<"A" | "fallback">();
  });

  it("onUnhandled error is accessible in data-last form without contextual E", () => {
    // Should NOT produce `never` — the onUnhandled parameter must be accessible even when
    // E is deferred (no contextual error type at matchErrorPartial call site).
    const matcher = matchErrorPartial(
      {
        ErrorA: (_err) => "A" as const,
      },
      (e) => {
        expectTypeOf(e._tag).toBeString();
        return "onUnhandled" as const;
      },
    );
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matcher(result.error);
    expectTypeOf(outcome).toEqualTypeOf<"A" | "onUnhandled">();
  });

  it("preserves unhandled errors when the pipeable onUnhandled callback is Result.err", () => {
    type ApiError = ErrorA | ErrorB | ErrorC;
    const getError = (): ApiError => new ErrorA();
    const matcher = matchErrorPartial(
      {
        ErrorC: (handled: ErrorC) => Result.ok(handled),
      },
      Result.err,
    );

    const outcome = matcher(getError());

    expectTypeOf(outcome).toEqualTypeOf<Ok<ErrorC, never> | Err<never, ErrorA | ErrorB>>();
  });

  it("composes a Result.err onUnhandled callback with widening tryRecover", () => {
    type ApiError = ErrorA | ErrorB | ErrorC;
    const getResult = (): Result<string, ApiError> => Result.err(new ErrorA());

    const recovered = getResult().tryRecover(
      matchErrorPartial(
        {
          ErrorC: (handled: ErrorC) => Result.ok(handled),
        },
        Result.err,
      ),
    );

    expectTypeOf(recovered).toEqualTypeOf<Result<string | ErrorC, ErrorA | ErrorB>>();
  });
});
