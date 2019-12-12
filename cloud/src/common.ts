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

import { sha256hex } from "@adpt/utils";
import { ExecaError } from "execa";

export function isExecaError(e: Error): e is ExecaError {
    if (!e.message.startsWith("Command failed")) return false;
    if (!("exitCode" in e)) return false;
    return true;
}

/**
 * Minimum number of hex characters for the SHA portion of a resource name.
 * Keeping this value higher ensures lower probability of name collisions.
 * @internal
 */
export const minShaLen = 8;
/**
 * Maximum number of hex characters for the SHA portion of a resource name.
 * This value just keeps generated names from being annoyingly long to humans.
 * @internal
 */
export const maxShaLen = 32;

/**
 * Creates a function for generating unique names for Adapt Elements.
 * @remarks
 * The unique names are unique by probability, based on a SHA256 hash.
 * They are are made up of:
 *
 * - The Element's key, with any invalid characters removed.
 *
 * - A separator character (or string)
 *
 * - A portion of the SHA256 hash of the Element's ID and the deployID.
 *
 * @param invalidChars - A regular expression that matches all invalid
 * characters that should NOT be included in the resulting name. Must have
 * the global flag set. For example, if only alphabetic characters and dashes
 * are allowed, set `invalidChars` to: `/[^a-zA-Z-]/g`
 * @param maxLen - The maximum allowed length of name that should be generated.
 * @param sep - The separator string to be used between they key and the hash.
 *
 * @public
 */
export function makeResourceName(invalidChars: RegExp, maxLen: number, sep = "-") {
    if (!invalidChars.global) {
        throw new Error(`invalidChars must be a RegExp with the global flag set`);
    }

    return (elemKey: string, elemID: string, deployID: string) => {
        const base = elemKey.toLowerCase().replace(invalidChars, "");
        const baseLen = Math.min(maxLen - minShaLen - sep.length, base.length);
        const shaLen = Math.min(maxShaLen, maxLen - baseLen - sep.length);
        return base.slice(0, baseLen) + sep + sha256hex(elemID + deployID).slice(0, shaLen);
    };
}
