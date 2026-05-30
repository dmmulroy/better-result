import { describe, expectTypeOf, it } from "vitest";
import { matchError, matchErrorPartial, TaggedError } from "./error";
import { Result } from "./result";

class ErrorA extends TaggedError("ErrorA")<{}>() {}
class ErrorB extends TaggedError("ErrorB")<{}>() {}
class ErrorC extends TaggedError("ErrorC")<{}>() {}

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

  it("works data-last (pipeable)", () => {
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

  it("fallback error is accessible in data-last form without contextual E", () => {
    // Should NOT produce `never` — fallback param must be accessible even when
    // E is deferred (no contextual error type at matchErrorPartial call site).
    const matcher = matchErrorPartial(
      {
        ErrorA: (_err) => "A" as const,
      },
      (e) => {
        expectTypeOf(e._tag).toBeString();
        return "fallback" as const;
      },
    );
    const result = Result.err<void, ErrorA | ErrorB>(new ErrorA());
    const outcome = matcher(result.error);
    expectTypeOf(outcome).toEqualTypeOf<"A" | "fallback">();
  });
});
