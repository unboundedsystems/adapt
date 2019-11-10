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

import { notNull } from "@adpt/utils";

/**
 * A single environment variable for a {@link Container}, expressed as an
 * object with `name` and `value` properties.
 *
 * @public
 */
export interface EnvPair {
    name: string;
    value: string;
}

/**
 * A set of environment variables for a {@link Container}, expressed as an
 * array of objects with `name` and `value` properties.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type EnvPairs = EnvPair[];

/**
 * A set of environment variables for a {@link Container}, expressed as a
 * single object with keys and associated values.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export interface EnvSimple {
    [key: string]: string;
}

/**
 * A set of environment variables for a {@link Container}.
 *
 * @remarks
 * See the
 * {@link https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate | Docker API Reference}
 * for more information.
 * @public
 */
export type Environment = EnvPair[] | EnvSimple;

/**
 * Combine multiple {@link Environment} objects into a single array of
 * {@link EnvPair} objects. Returns `undefined` if there are no `Environment`
 * objects provided.
 * @remarks
 * If more than one `Environment` object specifies the same environment variable
 * name, the last one present in the array of arguments takes precedence.
 * @public
 */
export function mergeEnvPairs(...envs: (Environment | undefined)[]): EnvPairs | undefined {
    const vals = new Map<string, EnvPair>();
    for (const e of envs) {
        if (!e) continue;
        if (Array.isArray(e)) e.forEach((pair) => vals.set(pair.name, pair));
        else Object.keys(e).map((name) => vals.set(name, { name, value: e[name] }));
    }
    return vals.size ? [...vals.values()] : undefined;
}

/**
 * Combine multiple {@link Environment} objects into a single
 * {@link EnvSimple} object. Returns `undefined` if there are no `Environment`
 * objects provided.
 * @remarks
 * If more than one `Environment` object specifies the same environment variable
 * name, the last one present in the array of arguments takes precedence.
 * @public
 */
export function mergeEnvSimple(...envs: (Environment | undefined)[]): EnvSimple | undefined {
    let ret: EnvSimple | undefined;
    envs.forEach((e) => {
        if (!e) return;
        if (!ret) ret = {};
        if (Array.isArray(e)) {
            e.forEach((pair) => (ret as EnvSimple)[pair.name] = pair.value);
        } else {
            Object.assign(ret, e);
        }
    });
    return ret;
}
/**
 * Renames all variables in `e` based on `mapping`
 *
 * @param e - {@link Environment} to rename
 * @param mapping - Object with `(key, value)` pairs that are `(originalName, newName)` pairs.
 *
 * @returns A new {@link Environment} object with all variables renamed according to `mapping`
 *
 * @public
 */
export function renameEnvVars(e: Environment, mapping: { [orig: string]: string }): Environment {
    return updateEnvVars(e, (name, value) => ({ name: mapping[name] || name, value }));
}

/**
 * Find the value of an environment variable in an {@link Environment}
 *
 * @param e - {@link Environment} to search
 * @param name - variable to search for
 * @returns the value of the variable name in e, or undefined if not found
 *
 * @public
 */
export function lookupEnvVar(e: Environment, name: string): string | undefined {
    if (Array.isArray(e)) {
        const pair = e.find((p) => p.name === name);
        if (pair === undefined) return undefined;
        return pair.value;
    } else {
        return e[name];
    }
}

/**
 * Updates the names and/or values of variables in an {@link Environment}
 *
 * @param e - The source {@link Environment}
 * @param upd - Updated function that returns an EnvPair with the new name and value of the variable
 * @returns - A new {@link Environment} that is identical to `e` except for the updates done by `upd`
 *
 * @public
 */
export function updateEnvVars(e: Environment, upd: (name: string, value: string) => EnvPair | undefined) {
    if (Array.isArray(e)) {
        return e.map((p: EnvPair) => upd(p.name, p.value)).filter(notNull);
    }
    const ret: EnvSimple = {};
    for (const k in e) {
        if (Object.hasOwnProperty.call(e, k)) {
            const res = upd(k, e[k]);
            if (notNull(res)) {
                ret[res.name] = res.value;
            }
        }
    }
    return ret;
}

/**
 * Formats an {@link Environment} for printing in human-readable format.
 *
 * @param env - The environment to be printed.
 * @returns - A string representation of the environment for use in logging
 * or debugging.
 *
 * @public
 */
export function formatEnvVars(env: Environment) {
    const pairs = mergeEnvPairs(env);
    if (!pairs || pairs.length === 0) return "<empty>";
    return pairs.map((p) => `${p.name}: '${p.value}'`).join("\n");
}
