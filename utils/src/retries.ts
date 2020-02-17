/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { randomBytes } from "crypto";
import { onExit } from "./exit";

let exiting = false;
let onExitRegistered = false;

export type RetryDelay = (attempt: number) => number;

export interface RetryDelayOptions {
    cancel: () =>  boolean;
    factor: number;
    maxTimeoutMs: number;
    minTimeoutMs: number;
    randomize: boolean;
    retries: number;
}

const defaultRetryDelayOptions: RetryDelayOptions = {
    cancel: () => false,
    factor: 2,
    maxTimeoutMs: 1000,
    minTimeoutMs: 100,
    randomize: true,
    retries: Infinity,
};

export function rand(min: number, max: number) {
    return randomBytes(4).readUInt32BE(0) * (max - min) / 0xffffffff + min;
}

/**
 * Makes a retry delay function that, given a retry attempt number, returns
 * how many milliseconds to wait before the next attempt.
 * @remarks
 *
 * @returns The number of milliseconds to wait before the next attempt or
 * -1 to indicate that no more retries should be attempted.
 */
export function makeRetryDelay(options: Partial<RetryDelayOptions> = {}): RetryDelay {
    const opts = { ...defaultRetryDelayOptions, ...options };
    if (opts.minTimeoutMs < 1) {
        throw new Error(`minTimeoutMs must be at least 1 (min=${opts.minTimeoutMs})`);
    }
    if (opts.maxTimeoutMs <= opts.minTimeoutMs) {
        throw new Error(`maxTimeoutMs must be greater than minTimeoutMs(min=${opts.minTimeoutMs} max=${opts.maxTimeoutMs})`);
    }
    if (!onExitRegistered) {
        onExit(() => exiting = true);
        onExitRegistered = true;
    }
    return (attempt: number) => {
        if (attempt < 0) {
            throw new Error(`Retry attempt cannot be less than 0. (attempt=${attempt})`);
        }
        if (exiting || attempt >= opts.retries || opts.cancel()) return -1;
        const jitter = opts.randomize ? rand(1, 2) : 1;
        let retry = jitter * opts.minTimeoutMs * Math.pow(opts.factor, attempt);
        if (retry > opts.maxTimeoutMs) {
            retry = opts.maxTimeoutMs;
            if (opts.randomize) {
                // Create jitter even when we'd normally be at max
                retry -= rand(0, opts.minTimeoutMs);
            }
        }
        return retry;
    };
}
