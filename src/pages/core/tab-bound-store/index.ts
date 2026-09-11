export { TabBoundStore } from "./service/tab-bound-store.js";
export type { TabBoundStoreOptions } from "./service/tab-bound-store.js";

export { ChromeStorageTabBoundRepository } from "./repository/chrome-storage-repository.js";
export { InMemoryTabBoundRepository } from "./repository/in-memory-repository.js";
export type { TabBoundRepository } from "./repository/repository.js";

export { rematchRecords } from "./domain/rematch.js";
export type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "./domain/types.js";
