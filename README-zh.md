# better-result

用于 TypeScript 的轻量级 Result 类型，支持基于生成器的组合。

📖 **[文档](https://better-result.dev/core/creating-results)**

## 安装

```sh
npm install better-result
```

或使用 Bun / pnpm：

```sh
bun add better-result
pnpm add better-result
```

## 快速开始

```ts
import { Result } from "better-result";

// 包装会抛出异常的函数
const parsed = Result.try(() => JSON.parse(input));

// 检查并使用
if (Result.isOk(parsed)) {
  console.log(parsed.value);
} else {
  console.error(parsed.error);
}

// 或使用模式匹配
const message = parsed.match({
  ok: (data) => `Got: ${data.name}`,
  err: (e) => `Failed: ${e.message}`,
});
```

## 目录

- [创建 Result](#creating-results)
- [转换 Result](#transforming-results)
- [处理错误](#handling-errors)
- [观察 Result](#observing-results)
- [提取值](#extracting-values)
- [生成器组合](#generator-composition)
- [重试支持](#retry-support)
- [UnhandledException](#unhandledexception)
- [Panic](#panic)
- [Tagged Error](#tagged-errors)
- [序列化](#serialization)
- [API 参考](#api-reference)
- [Agents 与 AI](#agents--ai)

## 创建 Result

```ts
// 成功
const ok = Result.ok(42);

// 错误
const err = Result.err(new Error("failed"));

// 从会抛出异常的函数创建
const result = Result.try(() => riskyOperation());

// 从 Promise 创建
const result = await Result.tryPromise(() => fetch(url));

// 使用自定义错误处理
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
```

## 转换 Result

```ts
const result = Result.ok(2)
  .map((x) => x * 2) // Ok(4)
  .andThen(
    (
      x, // 链式调用返回 Result 的函数
    ) => (x > 0 ? Result.ok(x) : Result.err("negative")),
  );

// 独立函数（数据优先或数据后置）
Result.map(result, (x) => x + 1);
Result.map((x) => x + 1)(result); // 可管道化
```

## 处理错误

```ts
// 转换错误类型
const result = fetchUser(id).mapError((e) => new AppError(`Failed to fetch user: ${e.message}`));

// 从特定错误恢复，同时保持相同的成功类型
const result = fetchUser(id).tryRecover((e) =>
  e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
);

// 异步恢复遵循相同的模式
// 如果 fetchUser 是异步的并返回 Promise<Result<User, E>>，先 await 它。
const result = await (
  await fetchUser(id)
).tryRecoverAsync(async (e) =>
  e._tag === "NetworkError" ? Result.ok(await readUserFromCache(id)) : Result.err(e),
);
```

## 观察 Result

使用 `tap` / `tapAsync` 进行成功侧的日志记录或追踪，使用 `tapError` / `tapErrorAsync` 进行错误侧的日志记录或追踪，当你想用一个处理器对象同时观察两个分支时，使用 `tapBoth` / `tapBothAsync`。这些方法不会转换 `Result`——它们始终返回原始值不变。

```ts
const result = Result.try(() => JSON.parse(input))
  .tap((value) => {
    console.debug("parsed payload", value);
  })
  .tapError((error) => {
    console.error("failed to parse payload", error);
  });
```

如果你想用一次调用对称地观察两个分支，使用 `tapBoth`：

```ts
const result = Result.try(() => JSON.parse(input)).tapBoth({
  ok: (value) => {
    console.info("decoded payload", value);
  },
  err: (error) => {
    console.warn("decode failed", error);
  },
});
```

异步副作用遵循相同的模式：

```ts
const result = await Result.err("request failed").tapErrorAsync(async (error) => {
  await trace("request.failed", { error });
});
```

`tapBothAsync` 对异步观察者的两个分支以相同方式工作：

```ts
const observed = await Result.tapBothAsync(
  Result.try(() => JSON.parse(input)),
  {
    ok: async (value) => {
      await trace("payload.decoded", { value });
    },
    err: async (error) => {
      await trace("payload.decode_failed", { error });
    },
  },
);
```

静态辅助函数同时支持数据优先和数据后置风格：

```ts
const traced = Result.tapError(Result.err("cache miss"), (error) => {
  console.warn("cache lookup failed", error);
});

const traceError = Result.tapErrorAsync(async (error: string) => {
  await trace("cache.lookup_failed", { error });
});

await traceError(Result.err("cache miss"));
```

如果你愿意，仍然可以通过分别链式调用 `tap` 和 `tapError` 来观察两个分支。

副作用回调中抛出的异常或被拒绝的 Promise 会变成 `Panic`，与其他 Result 回调一样。

## 提取值

```ts
// 解包（Err 时抛出异常）
const value = result.unwrap();
const value = result.unwrap("custom error message");

// 带默认值
const value = result.unwrapOr(defaultValue);

// 模式匹配
const value = result.match({
  ok: (v) => v,
  err: (e) => fallback,
});
```

## 生成器组合

在没有嵌套回调或提前返回的情况下链式处理多个 Result：

```ts
const result = Result.gen(function* () {
  const a = yield* parseNumber(inputA); // 解包或短路
  const b = yield* parseNumber(inputB);
  const c = yield* divide(a, b);
  return Result.ok(c);
});
// Result<number, ParseError | DivisionError>
```

使用 `Result.await` 的异步版本：

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser(id));
  const posts = yield* Result.await(fetchPosts(user.id));
  return Result.ok({ user, posts });
});
```

所有 yield 的 Result 中的错误会自动收集到最终的错误联合类型中。

### 统一错误类型

使用 `Result.gen()` 输出上的 `mapError` 将多种错误类型统一为单一类型：

```ts
class ParseError extends TaggedError("ParseError")<{ message: string }> {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }> {}
class AppError extends TaggedError("AppError")<{ source: string; message: string }> {}

const result = Result.gen(function* () {
  const parsed = yield* parseInput(input); // Err: ParseError
  const valid = yield* validate(parsed); // Err: ValidationError
  return Result.ok(valid);
}).mapError((e): AppError => new AppError({ source: e._tag, message: e.message }));
// Result<ValidatedData, AppError> - 错误联合类型统一为单一类型
```

## 重试支持

```ts
const result = await Result.tryPromise(() => fetch(url), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential", // 或 "linear" | "constant"
  },
});
```

### 条件重试

使用 `shouldRetry` 仅对特定错误类型进行重试：

```ts
class NetworkError extends TaggedError("NetworkError")<{ message: string }> {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }> {}

const result = await Result.tryPromise(
  {
    try: () => fetchData(url),
    catch: (e) =>
      e instanceof TypeError // 网络故障通常抛出 TypeError
        ? new NetworkError({ message: (e as Error).message })
        : new ValidationError({ message: String(e) }),
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => e._tag === "NetworkError", // 仅重试网络错误
    },
  },
);
```

### 异步重试决策

对于需要异步操作的重试决策（速率限制、功能标志等），在 `catch` 处理器中丰富错误信息，而不是将 `shouldRetry` 设为异步：

```ts
class ApiError extends TaggedError("ApiError")<{
  message: string;
  rateLimited: boolean;
}> {}

const result = await Result.tryPromise(
  {
    try: () => callApi(url),
    catch: async (e) => {
      // 在 catch 处理器中获取异步状态
      const retryAfter = await redis.get(`ratelimit:${userId}`);
      return new ApiError({
        message: (e as Error).message,
        rateLimited: retryAfter !== null,
      });
    },
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => !e.rateLimited, // 同步谓词使用已丰富错误
    },
  },
);
```

## UnhandledException

当 `Result.try()` 或 `Result.tryPromise()` 捕获到没有自定义处理器的异常时，错误类型为 `UnhandledException`：

```ts
import { Result, UnhandledException } from "better-result";

// 自动——错误类型为 UnhandledException
const result = Result.try(() => JSON.parse(input));
//    ^? Result<unknown, UnhandledException>

// 自定义处理器——你可以控制错误类型
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
//    ^? Result<unknown, ParseError>

// 异步情况同理
await Result.tryPromise(() => fetch(url));
//    ^? Promise<Result<Response, UnhandledException>>
```

通过 `.cause` 访问原始异常：

```ts
if (Result.isError(result)) {
  const original = result.error.cause;
  if (original instanceof SyntaxError) {
    // 处理 JSON 解析错误
  }
}
```

## Panic

当用户回调在 Result 操作内部抛出异常时被抛出（而不是返回）。代表你代码中的缺陷，而不是领域错误。

```ts
import { Panic, isPanic } from "better-result";

// 回调抛出异常 → Panic
Result.ok(1).map(() => {
  throw new Error("bug");
}); // 抛出 Panic

// 生成器清理时抛出异常 → Panic
Result.gen(function* () {
  try {
    yield* Result.err("expected failure");
  } finally {
    throw new Error("cleanup bug");
  }
}); // 抛出 Panic

// catch 处理器抛出异常 → Panic
Result.try({
  try: () => riskyOp(),
  catch: () => {
    throw new Error("bug in handler");
  },
}); // 抛出 Panic

// 捕获 Panic（用于错误报告）
try {
  result.map(() => {
    throw new Error("bug");
  });
} catch (error) {
  if (isPanic(error)) {
    // isPanic() 是一个类型守卫函数
    console.error("Defect:", error.message, error.cause);
  }

  if (Panic.is(error)) {
    // Panic.is() 是一个静态方法（行为相同）
  }

  if (error instanceof Panic) {
    // instanceof 也可以使用
  }
}
```

**为什么需要 Panic？** `Err` 用于可恢复的领域错误。Panic 用于 bug——类似于 Rust 的 `panic!()`。如果你的 `.map()` 回调抛出异常，那不是需要处理的错误，而是需要修复的缺陷。返回 `Err` 会破坏类型安全（`Result<T, E>` 会变成 `Result<T, E | unknown>`）。

**Panic 属性：**

| 属性      | 类型      | 描述                        |
| --------- | --------- | --------------------------- |
| `message` | `string`  | 描述在哪里/什么触发了 Panic |
| `cause`   | `unknown` | 被抛出的异常                |

Panic 还提供 `toJSON()` 方法，用于错误报告服务（Sentry 等）。

## Tagged Error

使用可辨识联合构建穷举错误处理：

```ts
import { Result, TaggedError, matchError, matchErrorPartial } from "better-result";

// 工厂 API：TaggedError("Tag")<Props>()
class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}> {}

class ValidationError extends TaggedError("ValidationError")<{
  field: string;
  message: string;
}> {}

type AppError = NotFoundError | ValidationError;

// 使用对象参数创建错误
const err = new NotFoundError({ id: "123", message: "User not found" });

// 穷举匹配
matchError(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Bad field: ${e.field}`,
});

// 带回退的部分匹配
matchErrorPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown: ${e.message}`,
);

// 类型守卫
TaggedError.is(value); // 任何 tagged error
NotFoundError.is(value); // 特定类
```

### 在 `Result.gen` 中 yield Tagged Error

Tagged error 可以直接短路 `Result.gen`。这对于可恢复的领域错误很有用，等同于 yield `Result.err(error)`；不会抛出异常。

```ts
const result = Result.gen(function* () {
  yield* new NotFoundError({ id: "123", message: "missing" });
  return Result.ok("never reached");
});
// Result<string, NotFoundError>
// => Err(原始 NotFoundError 实例)
```

它们也可以与普通的 `Result` 值组合，并参与推断的错误联合类型：

```ts
const result = Result.gen(function* () {
  const user = yield* findUser("123"); // Result<User, NotFoundError>

  if (!user.active) {
    yield* new ValidationError({ field: "active", message: "User is inactive" });
  }

  return Result.ok(user);
});
// Result<User, NotFoundError | ValidationError>
```

对于需要计算消息的错误，添加自定义构造函数：

```ts
class NetworkError extends TaggedError("NetworkError")<{
  url: string;
  status: number;
  message: string;
}> {
  constructor(args: { url: string; status: number }) {
    super({ ...args, message: `Request to ${args.url} failed: ${args.status}` });
  }
}

new NetworkError({ url: "/api", status: 404 });
```

## 序列化

将 Result 转换为普通对象，用于 RPC、存储或 Server Actions：

```ts
import { Result, SerializedResult, ResultDeserializationError } from "better-result";

// 序列化为普通对象
const result = Result.ok(42);
const serialized = Result.serialize(result);
// { status: "ok", value: 42 }

// 反序列化回 Result 实例
const deserialized = Result.deserialize<number, never>(serialized);
// Ok(42) - 可以使用 .map()、.andThen() 等

// 无效输入返回 ResultDeserializationError
const invalid = Result.deserialize({ foo: "bar" });
if (Result.isError(invalid) && ResultDeserializationError.is(invalid.error)) {
  console.log("Bad input:", invalid.error.value);
}

// Next.js Server Actions 的类型边界
async function createUser(data: FormData): Promise<SerializedResult<User, ValidationError>> {
  const result = await validateAndCreate(data);
  return Result.serialize(result);
}

// 客户端
const serialized = await createUser(formData);
const result = Result.deserialize<User, ValidationError>(serialized);
```

## API 参考

### Result

| 方法                                    | 描述                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Result.ok(value)`                      | 创建成功值                                                                               |
| `Result.err(error)`                     | 创建错误值                                                                               |
| `Result.try(fn)`                        | 包装会抛出异常的函数                                                                     |
| `Result.tryPromise(fn, config?)`        | 包装异步函数，可选重试                                                                   |
| `Result.isOk(result)`                   | Ok 的类型守卫                                                                            |
| `Result.isError(result)`                | Err 的类型守卫                                                                           |
| `Result.gen(fn)`                        | 生成器组合                                                                               |
| `Result.tryRecover(result, fn)`         | 将错误恢复为相同成功类型                                                                 |
| `Result.tryRecoverAsync(result, fn)`    | 异步将错误恢复为相同成功类型                                                             |
| `Result.tap(result, fn)`                | 在成功时运行副作用并返回原始 result                                                      |
| `Result.tapAsync(result, fn)`           | 在成功时运行异步副作用并返回原始 result                                                  |
| `Result.tapError(result, fn)`           | 在错误时运行副作用并返回原始 result                                                      |
| `Result.tapErrorAsync(result, fn)`      | 在错误时运行异步副作用并返回原始 result                                                  |
| `Result.tapBoth(result, handlers)`      | 在任一分支运行副作用并返回原始 result                                                    |
| `Result.tapBothAsync(result, handlers)` | 在任一分支运行异步副作用并返回原始 result                                                |
| `Result.await(promise)`                 | 为生成器包装 Promise<Result>                                                             |
| `Result.serialize(result)`              | 将 Result 转换为普通对象                                                                 |
| `Result.deserialize(value)`             | 反序列化已序列化的 Result（无效输入时返回 `Err<ResultDeserializationError>`）             |
| `Result.partition(results)`             | 将数组拆分为 [okValues, errValues]                                                       |
| `Result.flatten(result)`                | 打平嵌套的 Result                                                                        |

### 实例方法

| 方法                    | 描述                                |
| ----------------------- | ----------------------------------- |
| `.isOk()`               | 类型守卫，收窄为 Ok                 |
| `.isErr()`              | 类型守卫，收窄为 Err                |
| `.map(fn)`              | 转换成功值                          |
| `.mapError(fn)`         | 转换错误值                          |
| `.tryRecover(fn)`       | 将错误恢复为相同成功类型            |
| `.tryRecoverAsync(fn)`  | 异步将错误恢复为相同成功类型        |
| `.andThen(fn)`          | 链式调用返回 Result 的函数          |
| `.andThenAsync(fn)`     | 链式调用异步返回 Result 的函数      |
| `.match({ ok, err })`   | 模式匹配                            |
| `.unwrap(message?)`     | 提取值或抛出异常                    |
| `.unwrapOr(fallback)`   | 提取值或返回默认值                  |
| `.tap(fn)`              | 成功时的副作用                      |
| `.tapAsync(fn)`         | 成功时的异步副作用                  |
| `.tapError(fn)`         | 错误时的副作用                      |
| `.tapErrorAsync(fn)`    | 错误时的异步副作用                  |
| `.tapBoth(handlers)`    | 任一分支的副作用                    |
| `.tapBothAsync(handlers)` | 任一分支的异步副作用              |

### TaggedError

| 方法                                 | 描述                             |
| ------------------------------------ | -------------------------------- |
| `TaggedError(tag)<Props>()`          | Tagged error 类的工厂            |
| `TaggedError.is(value)`              | 任意 TaggedError 的类型守卫      |
| `matchError(err, handlers)`          | 按 `_tag` 进行穷举模式匹配      |
| `matchErrorPartial(err, handlers, fb)` | 带回退的部分匹配               |
| `isTaggedError(value)`               | 类型守卫（独立函数）             |
| `panic(message, cause?)`             | 抛出不可恢复的 Panic             |
| `isPanic(value)`                     | Panic 的类型守卫                 |

### 类型辅助工具

| 类型                     | 描述                       |
| ------------------------ | -------------------------- |
| `InferOk<R>`             | 从 Result 中提取 Ok 类型   |
| `InferErr<R>`            | 从 Result 中提取 Err 类型  |
| `SerializedResult<T, E>` | Result 的普通对象形式      |
| `SerializedOk<T>`        | Ok 的普通对象形式          |
| `SerializedErr<E>`       | Err 的普通对象形式         |

## Agents 与 AI

better-result 附带便携式的 `SKILL.md` 技能文件，而不是交互式 CLI。

### 可用技能

- `better-result-adopt` — 在现有代码库中采用 `better-result`
- `better-result-migrate-v2` — 将 v1 `TaggedError` 用法迁移到 v2 API

这些技能设计用于兼容 SKILL.md 的 agent 和兼容 skills.sh 的工具。

### 使用兼容 skills.sh 的工具安装

```sh
npx skills add dmmulroy/better-result@better-result-adopt
npx skills add dmmulroy/better-result@better-result-migrate-v2
```

全局安装且不提示：

```sh
npx skills add dmmulroy/better-result@better-result-adopt -g -y
```

### 手动安装

如果你的 agent 不支持 skills.sh 安装，请将以下目录之一复制到 agent 的 skills 文件夹中：

- `skills/better-result-adopt/`
- `skills/better-result-migrate-v2/`

### 技能功能说明

`better-result-adopt` 指导 agent 完成：

- 将 try/catch 转换为 `Result.try` / `Result.tryPromise`
- 为领域错误定义 `TaggedError` 类
- 将嵌套错误处理重构为 `Result.gen`
- 用 `Result` 替换可空值或哨兵值错误返回

`better-result-migrate-v2` 指导 agent 完成：

- 将 `TaggedError` 类从 v1 迁移到 v2 工厂语法
- 将构造函数调用点更新为新的对象形式
- 用独立辅助函数替换 `TaggedError.match*` 辅助函数
- 更新导入并验证没有旧 API 的使用残留

### 可选的源代码上下文

为了在消费项目中获得更丰富的 AI 上下文：

```sh
npx opensrc better-result
```

参见 [skills/README.md](skills/README.md) 获取简洁的技能安装参考。

## 许可证

MIT
