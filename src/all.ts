import { AnyResult, InferErr, InferOk, Result } from "./result";

type ModeSetting = "default" | "settled";

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
  Mode extends ModeSetting
> = Mode extends "default"
  ? AllEagerDefaultReturn<T>
  : AllEagerSettledReturn<T>;

const allEager = async <
  T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting
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

type ConcurrencySetting = "unbounded" | number;

type AllLazyDefaultReturn<T extends readonly (() => Promise<AnyResult>)[]> =
  Promise<
    Result<
      {
        [K in keyof T]: InferOk<Awaited<ReturnType<T[K]>>>;
      },
      InferErr<Awaited<ReturnType<T[number]>>>
    >
  >;

type AllLazySettledReturn<T extends readonly (() => Promise<AnyResult>)[]> =
  Promise<{
    [K in keyof T]: Awaited<ReturnType<T[K]>>;
  }>;

type AllLazyReturn<
  T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting
> = Mode extends "default" ? AllLazyDefaultReturn<T> : AllLazySettledReturn<T>;

const allLazy = async <
  T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting
>(
  lazyPromises: T,
  mode: Mode,
  concurrency: ConcurrencySetting
): Promise<AllLazyReturn<T, Mode>> => {
  if (concurrency === "unbounded") {
    return (await allEager(
      lazyPromises.map((lazyPromise) => lazyPromise()),
      mode
    )) as any;
  }

  const executing = new Set<Promise<AnyResult>>();
  const queue = [...lazyPromises];
  const results: any[] = [];
  let index = 0;
  do {
    while (executing.size < concurrency) {
      const nextLazyPromise = queue.shift();
      if (nextLazyPromise === undefined) {
        break;
      }

      const promise = nextLazyPromise();
      const currentIndex = index++;
      executing.add(promise);
      promise.then((result) => {
        executing.delete(promise);
        if (mode === "settled") {
          results[currentIndex] = result;
          return;
        }
        if (result.isOk()) {
          results[currentIndex] = result.value;
        }
        // Returning of error is handled after Promise.race
      });
    }

    const winner = await Promise.race(executing);
    if (winner.isErr() && mode === "default") {
      return winner as any;
    }
  } while (executing.size > 0 || queue.length > 0);

  if (mode === "settled") {
    return results as any;
  }

  return Result.ok(results) as any;
};

export async function all<
  const T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: "unbounded";
  }
): Promise<AllEagerReturn<T, Mode>>;
export async function all<
  const T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: ConcurrencySetting;
  }
): Promise<AllLazyReturn<T, Mode>>;
export async function all<
  const T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: ConcurrencySetting;
  }
): Promise<AllEagerReturn<T, Mode>> {
  if (typeof promises[0] === "function") {
    return (await allLazy(
      promises as any,
      options?.mode ?? "default",
      options?.concurrency ?? "unbounded"
    )) as any;
  }

  return (await allEager(promises, options?.mode ?? "default")) as any;
}
