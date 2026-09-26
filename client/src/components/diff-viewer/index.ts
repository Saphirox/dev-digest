/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer and FileCard components + the
   DiffCommentApi contract, plus the line-keying helpers a caller needs to
   build `FileCard`'s `lineExtras` map (Smart Diff). */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { lineKey, lineKeysForPatch } from "./comments";
export { FileCard } from "./FileCard";
export { AUTO_EXPAND_MAX_LINES } from "./constants";
