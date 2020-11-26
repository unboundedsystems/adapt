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

import { Hook } from "@oclif/config";

/**
 * On Windows, environment variables are supposed to be case-insensitive.
 * However, in practice, having more than one capitalization of PATH causes
 * strange and subtle bugs when spawning child processes. Ensure that
 * the capitalized version is the only one set.
 */
function fixPath() {
    if (process.platform !== "win32") return;

    process.env.PATH = process.env.Path;
    const excessPathKeys =
        Object.keys(process.env).filter((k) => k !== "PATH" && k.toUpperCase() === "PATH");
    for (const k of excessPathKeys) {
        delete process.env[k];
    }
}

const hook: Hook<"init"> = async () => {
    fixPath();
};
export default hook;
