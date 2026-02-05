import { AnyResult, InferErr, InferOk, Result } from "./result";

type ErrorStrategy = "default" | "settled";

type AllEagerDefaultReturn<T extends readonly Promise<AnyResult>[]> = Promise<
  Result<
    {
      [K in keyof T]: InferOk<Awaited<T[K]>>;
    },
    InferErr<Awaited<T[number]>>
  >
>;

type AllEagerSettledReturn<T extends readonly Promise<AnyResult>[]> = Promise<{
  [K in keyof T]: Awaited<T[K]>;
}>;

type AllEagerReturn<
  T extends readonly Promise<AnyResult>[],
  Mode extends ErrorStrategy
> = Mode extends "default"
  ? AllEagerDefaultReturn<T>
  : AllEagerSettledReturn<T>;

const allEager = async <
  T extends readonly Promise<AnyResult>[],
  Mode extends ErrorStrategy
>(
  promises: T,
  mode: Mode
): Promise<AllEagerReturn<T, Mode>> => {
  if (mode === "settled") {
    return (await Promise.all(promises)) as any;
  }

  const data: any[] = [];
  const executing = new Set(promises);
  promises.forEach((promise, index) => {
    promise.then((result) => {
      if (result.status === "ok") {
        data[index] = result.value;
      }
      executing.delete(promise);
    });
  });

  while (executing.size > 0) {
    const winner = await Promise.race(executing);
    if (winner.status === "error") {
      return winner as any;
    }
  }

  return Result.ok(data) as any;
};

export async function all<
  const T extends readonly Promise<AnyResult>[],
  Mode extends ErrorStrategy = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
  }
): Promise<AllEagerReturn<T, Mode>> {
  return (await allEager(promises, options?.mode ?? "default")) as any;
}
