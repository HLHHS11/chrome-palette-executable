export { TabBoundStore } from "./service/tab-bound-store";
export type { TabBoundStoreOptions } from "./service/tab-bound-store";

export { ChromeTabBoundStorage } from "./storage/chrome-tab-bound-storage";
export { InMemoryTabBoundStorage } from "./storage/in-memory-tab-bound-storage";
export type { TabBoundStorage } from "./storage/tab-bound-storage";

export { rematchRecords } from "./domain/rematch";
export type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "./domain/types";
