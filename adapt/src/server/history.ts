export type HistoryName = string;

export interface HistoryEntry {
    domXml: string;
    stateJson: string;
    observationsJson: string;

    fileName: string;
    projectRoot: string;
    stackName: string;

    // NOTE(mark): HistoryEntry is intended to be the actual snapshot of
    // the data so that this interface could be the data returned by a remote
    // API query. All the items above follow that. But for a snapshot of
    // an arbitrary remote directory, there should be a different API.
    // Punting on this for now because this works for a local
    // history directory.
    dataDir: string;
}

export interface HistoryStore {
    // Write to history
    getDataDir(): Promise<string>;
    commitEntry(toStore: HistoryEntry): Promise<void>;

    // Release lock on dataDir without comitting
    releaseDataDir(): Promise<void>;

    // Read from history
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    last(): Promise<HistoryEntry | undefined>;

    // Destroy all history
    destroy(): Promise<void>;
}
