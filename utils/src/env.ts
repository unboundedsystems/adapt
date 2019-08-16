/*
 * Copyright 2018 Unbounded Systems, LLC
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

/**
 * Returns true if the specified environment variable is set to anything
 * other than the following list of false-ish strings:
 *   "0"
 *   "false"
 *   "off"
 *   "no"
 * The comparison performed is case-insensitive. Note that if the
 * environment variable is set to the empty string "", this will return true.
 * @param varName The name of the environment variable to query
 */
export function getEnvAsBoolean(varName: string): boolean {
    const val = process.env[varName];
    if (val == null) return false;
    switch (val.toLowerCase()) {
        case "0":
        case "false":
        case "off":
        case "no":
            return false;
        default:
            return true;
    }
}
