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

import { inDebugger, UserError } from "@adpt/utils";
import plf from "proper-lockfile";

export const lockDefaults = {
    retries: 2,
    // 1 day if in the debugger, otherwise 10 sec
    stale: inDebugger() ? 24 * 60 * 60 * 1000 : 10 * 1000,
};

export async function lock(filename: string, lockDescr: string, options: plf.LockOptions = {}) {
    try {
        return await plf.lock(filename, {
            ...lockDefaults,
            onCompromised: (err) => {
                // This function executes during a timer event, so stack and
                // other error info is not useful. Just display the error
                // message to the user.
                throw new UserError(`${lockDescr} error: ${err.message} (${filename})`);
            },
            ...options,
        });
    } catch (err) {
        // Call stack has the chance to catch and react to this error
        err.message = `${err.message} (${filename})`;
        throw err;
    }
}
