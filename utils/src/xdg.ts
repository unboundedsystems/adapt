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

import { homedir } from "os";
import path from "path";

const appName = "adapt";

function localAppData() {
    const appData = process.env.LOCALAPPDATA;
    if (!appData) throw new Error(`Environment variable LOCALAPPDATA is not set`);
    return appData;
}

export function xdgCacheDir(): string {
    let cacheHome = process.env.XDG_CACHE_HOME;
    if (!cacheHome) {
        switch (process.platform) {
            case "darwin":
                cacheHome = path.join(homedir(), "Library", "Caches");
                break;
            case "win32":
                cacheHome = localAppData();
                break;
            default:
                cacheHome = path.join(homedir(), ".cache");
                break;

        }
    }
    return path.join(cacheHome, appName);
}
