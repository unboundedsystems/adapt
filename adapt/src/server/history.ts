export type HistoryName = string;

export interface HistoryEntry {
    domXml: string;
    stateJson: string;

    fileName: string;
    projectRoot: string;
    stackName: string;
}

export interface HistoryWriter {
    appendEntry(toStore: HistoryEntry): Promise<void>;
    revert(): Promise<void>;
}

export interface HistoryStore {
    destroy(): Promise<void>;
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    last(): Promise<HistoryEntry | undefined>;
    writer(): Promise<HistoryWriter>;
}
