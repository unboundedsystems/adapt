/*
 * Copyright 2018-2020 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type HistoryName = string;

export enum HistoryStatus {
    preAct = "preAct",
    success = "success",
    failed = "failed",
    complete = "complete", // Shorthand for success|failed
}

export function isHistoryStatus(val: unknown): val is HistoryStatus {
    switch (val) {
        case "preAct":
        case "success":
        case "failed":
        case "complete":
            return true;
    }
    return false;
}

export function isStatusComplete(status: HistoryStatus) {
    return status === HistoryStatus.success || status === HistoryStatus.failed;
}

export interface HistoryEntry {
    status: HistoryStatus;
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
    getDataDir(withStatus: HistoryStatus): Promise<string>;
    commitEntry(toStore: HistoryEntry): Promise<void>;

    // Release lock on dataDir without comitting
    releaseDataDir(): Promise<void>;

    // Read from history
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    last(withStatus?: HistoryStatus): Promise<HistoryEntry | undefined>;

    // Destroy all history
    destroy(): Promise<void>;
}
