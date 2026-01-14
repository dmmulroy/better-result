export { Result, Ok, Err } from "./result";
export type { InferOk, InferErr } from "./result";
export {
  Panic,
  panic,
  isPanic,
  TaggedError,
  UnhandledException,
  matchError,
  matchErrorPartial,
  isTaggedError,
} from "./error";
export type { TaggedErrorInstance, TaggedErrorClass } from "./error";
