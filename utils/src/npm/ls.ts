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

import { CommonOptions, run } from "./common";

export interface LsCommonOptions extends CommonOptions {
    long?: boolean;
    packages?: string[];
}
export interface LsJsonOptions extends LsCommonOptions {
    ignoreError?: boolean;
}
export interface LsOptions extends LsCommonOptions {
    json?: boolean;
}

export interface LsTree {
    name?: string;
    version: string;

    dependencies?: LsTrees;
    from?: string;
    problems?: string[];
    resolved?: string;

    // --long
    bundleDependencies?: boolean;
    devDependencies?: LsVersions;
    error?: any;
    extraneous?: boolean;
    integrity?: string;
    main?: string;
    missing?: boolean;
    optional?: boolean;
    optionalDependencies?: LsVersions;
    path?: string;
    _args?: any[];
    _dependencies?: LsVersions;
    _from?: string;
    _id?: string;
    _integrity?: string;
    _location?: string;
    _phantomChildren?: LsVersions;
    _requested?: object;
    _resolved?: string;
    _requiredBy?: string[];
    _shasum?: string;
    _shrinkwrap?: object;
    _spec?: string;
    _where?: string;
}
export interface LsTrees {
    [ packageName: string]: LsTree;
}
export interface LsVersions {
    [ packageName: string]: string;
}

const defaultOptions = {
    packages: [],
};

export function ls(options?: LsOptions) {
    const { packages, ...finalOpts } = { ...defaultOptions, ...options };

    return run("ls", finalOpts, packages);
}

const defaultJsonOptions = {
    ignoreError: true,
};

export async function lsParsed(options?: LsJsonOptions): Promise<LsTree> {
    const { ignoreError, ...rest } = { json: true, ...defaultJsonOptions, ...options };

    try {
        const out = await ls(rest);
        return JSON.parse(out.stdout);
    } catch (err) {
        if (ignoreError) {
            try {
                return JSON.parse(err.stdout);
            } catch { // fall through
            }
        }
        throw err;
    }
}
