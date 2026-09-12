export { TabBoundStore } from "./service/tab-bound-store";
export type { TabBoundStoreOptions } from "./service/tab-bound-store";

export { ChromeStorageTabBoundRepository } from "./repository/chrome-storage-repository";
export { InMemoryTabBoundRepository } from "./repository/in-memory-repository";
export type { TabBoundRepository } from "./repository/repository";

export { rematchRecords } from "./domain/rematch";
export type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "./domain/types";
