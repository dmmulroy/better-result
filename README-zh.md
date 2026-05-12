# better-result

TypeScript 轻量级 Result 类型，支持基于生成器的组合。

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

// 包装可能抛出异常的函数
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

- [创建 Result](#创建-result)
- [转换 Result](#转换-result)
- [处理错误](#处理错误)
- [观察 Result](#观察-result)
- [提取值](#提取值)
- [生成器组合](#生成器组合)
- [重试支持](#重试支持)
- [UnhandledException](#unhandledexception)
- [Panic](#panic)
- [标记错误](#标记错误)
- [序列化](#序列化)
- [API 参考](#api-参考)
- [代理与 AI](#代理与-ai)

## 创建 Result

```ts
// 成功
const ok = Result.ok(42);

// 错误
const err = Result.err(new Error("failed"));

// 从可能抛出异常的函数
const result = Result.try(() => riskyOperation());

// 从 Promise
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

// 独立函数（数据优先或数据最后）
Result.map(result, (x) => x + 1);
Result.map((x) => x + 1)(result); // 可管道化
```

## 处理错误

```ts
// 转换错误类型
const result = fetchUser(id).mapError((e) => new AppError(`Failed to fetch user: ${e.message}`));

// 提供默认值
const user = fetchUser(id).unwrapOr(defaultUser);

// 使用恢复函数
const user = fetchUser(id).orElse((err) =>
  err.code === "NOT_FOUND" ? Result.ok(createUser(id)) : Result.err(err),
);
```

## 观察 Result

```ts
// 执行副作用
fetchUser(id)
  .tap((user) => console.log("Got user:", user.name))
  .tapError((err) => console.warn("Failed:", err));

// 两者都执行
fetchUser(id).tapBoth({
  ok: (user) => auditLog("User fetched", user.id),
  err: (err) => errorLog("Fetch failed", err),
});
```

## 提取值

```ts
// 安全提取（可能抛出异常）
const user = fetchUser(id).unwrap();

// 带默认值
const user = fetchUser(id).unwrapOr(defaultUser);

// 匹配处理
const name = fetchUser(id).match({
  ok: (user) => user.name,
  err: () => "Unknown",
});
```

## 生成器组合

使用 `Result.gen` 编写类似 async/await 的顺序代码，但同步且类型安全：

```ts
const order = Result.gen(function* () {
  const user = yield* fetchUser(userId);
  const cart = yield* fetchCart(user.id);
  const total = yield* calculateTotal(cart);

  return { user, cart, total };
});

// 任何 yield* 失败时，整个生成器停止并返回该错误
```

### 带错误恢复的生成器

```ts
const result = Result.gen(function* () {
  // 如果 fetchUser 失败，使用默认用户
  const user = yield* fetchUser(userId).orElse(() =>
    Result.ok(defaultUser),
  );

  const cart = yield* fetchCart(user.id);
  return cart;
});
```

### 异步生成器

```ts
const order = await Result.genAsync(async function* () {
  const user = yield* await fetchUserAsync(userId);
  const cart = yield* await fetchCartAsync(user.id);
  const total = yield* await calculateTotalAsync(cart);

  return { user, cart, total };
});
```

## 重试支持

```ts
// 基本重试
const result = Result.retry(() => fetchFromAPI(), {
  maxAttempts: 3,
  delay: 1000,
});

// 指数退避
const result = Result.retry(() => fetchFromAPI(), {
  maxAttempts: 5,
  delay: 1000,
  backoff: "exponential",
  maxDelay: 10000,
});

// 条件重试
const result = Result.retry(() => fetchFromAPI(), {
  maxAttempts: 3,
  delay: 1000,
  retryIf: (error) => error.code === "RATE_LIMITED",
});
```

## UnhandledException

当 Result 被创建但从未被检查时，`UnhandledException` 会被触发：

```ts
// 从未检查的 Result 会触发 UnhandledException
const result = Result.try(() => riskyOperation());
// 如果 result 从未被 unwrap/match/isOk 等调用
// 将在 GC 时触发 UnhandledException
```

### 自定义处理器

```ts
Result.setUnhandledHandler((result) => {
  console.error("Unhandled Result:", result.error);
  // 或发送到错误监控服务
  errorTracker.capture(result.error);
});
```

## Panic

当不可恢复的错误发生时使用 `panic`：

```ts
import { panic } from "better-result";

const config = loadConfig().unwrapOr(panic("Config file missing and no defaults"));
```

## 标记错误

使用标签为错误添加结构化元数据：

```ts
class AppError extends TaggedError<"AppError"> {
  readonly _tag = "AppError";
  constructor(
    readonly code: string,
    override readonly message: string,
  ) {
    super(message);
  }
}

// 类型安全的错误匹配
const result = fetchData().mapError((e) => new AppError("FETCH_FAILED", e.message));

result.match({
  ok: (data) => handleData(data),
  err: (e) => {
    switch (e._tag) {
      case "AppError":
        return handleAppError(e);
      case "NetworkError":
        return handleNetworkError(e);
    }
  },
});
```

## 序列化

Result 可以安全地序列化和反序列化：

```ts
const result = Result.ok({ name: "Alice", age: 30 });

// 序列化
const json = JSON.stringify(result);
// '{"_tag":"Ok","value":{"name":"Alice","age":30}}'

// 反序列化
const parsed = Result.deserialize(JSON.parse(json));
// Ok({ name: "Alice", age: 30 })
```

## API 参考

### 创建

| 函数 | 说明 |
|------|------|
| `Result.ok(value)` | 创建成功 Result |
| `Result.err(error)` | 创建错误 Result |
| `Result.try(fn)` | 从可能抛出异常的函数创建 |
| `Result.tryPromise(fn)` | 从异步函数创建 |
| `Result.gen(fn)` | 使用生成器组合多个 Result |
| `Result.genAsync(fn)` | 异步版本的生成器组合 |
| `Result.all(results)` | 聚合多个 Result |
| `Result.retry(fn, opts)` | 带重试的函数执行 |

### 转换

| 函数 | 说明 |
|------|------|
| `.map(fn)` | 转换成功值 |
| `.mapError(fn)` | 转换错误值 |
| `.andThen(fn)` | 链式调用返回 Result 的函数 |
| `.orElse(fn)` | 错误时尝试恢复 |
| `.flatMap(fn)` | `andThen` 的别名 |

### 观察

| 函数 | 说明 |
|------|------|
| `.tap(fn)` | 成功时执行副作用 |
| `.tapError(fn)` | 错误时执行副作用 |
| `.tapBoth(opts)` | 两者都执行 |

### 提取

| 函数 | 说明 |
|------|------|
| `.unwrap()` | 提取值（失败时抛出异常） |
| `.unwrapOr(default)` | 提取值或使用默认值 |
| `.unwrapOrElse(fn)` | 提取值或使用函数生成默认值 |
| `.match({ok, err})` | 模式匹配 |

### 检查

| 函数 | 说明 |
|------|------|
| `Result.isOk(result)` | 检查是否为成功 |
| `Result.isErr(result)` | 检查是否为错误 |
| `.isOk()` | 实例方法版本 |
| `.isErr()` | 实例方法版本 |

## 代理与 AI

`better-result` 非常适合 AI 代理工作流：

```ts
const agentResult = Result.gen(function* () {
  // 1. 解析用户输入
  const intent = yield* parseIntent(userMessage);

  // 2. 选择工具
  const tool = yield* selectTool(intent);

  // 3. 执行工具
  const result = yield* executeTool(tool, intent.params);

  // 4. 格式化响应
  return yield* formatResponse(result);
});

// 优雅处理错误
agentResult.match({
  ok: (response) => sendResponse(response),
  err: (error) => {
    if (error._tag === "ToolError") {
      return sendToolErrorMessage(error);
    }
    return sendGenericError(error);
  },
});
```

---

[MIT License](LICENSE)
