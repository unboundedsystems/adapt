/*
 * Copyright 2019 Unbounded Systems, LLC
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

import AsyncLock from "async-lock";
import pDefer from "p-defer";
import { InternalError } from "../error";
import {
    $serverLock,
    OptionsWithLock,
    ServerLock,
} from "./server";

export interface Locker<LockType> {
    lock(): Promise<LockType>;
    unlock(lock: LockType): Promise<void>;
}

export interface NoLock extends ServerLock {}

export class NoLocker implements Locker<NoLock> {
    lock() {
        return Promise.resolve<NoLock>({ [$serverLock]: true });
    }

    unlock(l: NoLock) {
        return Promise.resolve();
    }
}

export interface ProcessLock extends ServerLock {
    release: () => Promise<void>;
}

export class ProcessLocker implements Locker<ProcessLock> {
    protected locks = new AsyncLock();

    lock() {
        return new Promise<ProcessLock>((resolve, reject) => {
            const releaseComplete = pDefer<void>();

            this.locks.acquire("thelock",
                (releaseLock) => {
                    resolve({
                        release: async () => {
                            releaseLock();
                            return releaseComplete.promise;
                        },
                        [$serverLock]: true,
                    });
                },
                (err) => {
                    if (err) {
                        reject(err);
                        releaseComplete.reject(err);
                    } else {
                        releaseComplete.resolve();
                    }
                }
            );
        });
    }

    async unlock(lock: ProcessLock): Promise<void> {
        await lock.release();
    }
}

export abstract class ServerBase<L extends ServerLock = ServerLock> {
    protected processLocker = new ProcessLocker();
    protected worldLocker: Locker<L>;

    protected currentProcessLock?: ProcessLock;
    protected currentWorldLock?: L;

    constructor(worldLocker?: Locker<L>) {
        this.worldLocker = worldLocker || (new NoLocker()) as Locker<L>;
    }

    async lock(): Promise<ServerLock> {
        let pLock: ProcessLock | undefined;
        try {
            pLock = await this.processLocker.lock();
            if (this.currentProcessLock) {
                throw new InternalError(`AdaptServer: previous process lock not cleared`);
            }
            this.currentProcessLock = pLock;

            this.currentWorldLock = await this.worldLocker.lock();
            return pLock;

        } catch (err) {
            if (pLock) {
                if (pLock === this.currentProcessLock) delete this.currentProcessLock;
                await this.processLocker.unlock(pLock);
            }
            throw err;
        }
    }

    async unlock(l: ServerLock) {
        if (!this.assertLock(l, "unlock")) throw new InternalError(`Bad lock`);
        const wLock = this.currentWorldLock;
        if (wLock) {
            delete this.currentWorldLock;
            await this.worldLocker.unlock(wLock);
        }
        delete this.currentProcessLock;
        await this.processLocker.unlock(l);
    }

    protected async withLock<T>(options: OptionsWithLock, f: () => Promise<T>): Promise<T> {
        let release: () => Promise<void>;

        if (options.lock) {
            // Requester thinks they already hold the lock. But do they?
            this.assertLock(options.lock, "use");
            // They do hold the lock. So don't unlock when this
            // operation is complete; requester will call unlock later.
            release = async () => {/**/};
        } else {
            // Get a temporary per-operation lock
            const tempLock = await this.lock();
            release = () => this.unlock(tempLock);
        }

        try {
            return await f();
        } finally {
            await release();
        }
    }

    // Confirm that a lock is the current lock
    protected assertLock(l: ServerLock, op: string): l is ProcessLock {
        if (!this.currentProcessLock) {
            throw new InternalError(
                `AdaptServer: Attempt to ${op} a stale lock. Server is not ` +
                `currently locked.`);
        }
        if (l !== this.currentProcessLock) {
            throw new InternalError(
                `AdaptServer: Attempt to ${op} a stale lock. Server is locked ` +
                `by another user.`);
        }
        return true;
    }
}
