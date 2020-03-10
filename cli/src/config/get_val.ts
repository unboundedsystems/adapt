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

import { AnyObject, UserError } from "@adpt/utils";
import { parseItem, Schema, SchemaValidationError } from "./schema";

export interface GetValOptions {
    /**
     * Return the default value from the schema if the requested property is
     * not present on the object.
     */
    useDefault?: boolean;
    /**
     * A transformation to apply to the property name before using it as an
     * index into the object.
     */
    propTransform?: (prop: string) => string;
}

const defaultGetValOptions = {
    useDefault: false,
    propTransform: (prop: string) => prop,
};

export function getValIfSet<S extends Schema, Prop extends keyof S>(
    prop: Prop, obj: AnyObject, schema: S, options: GetValOptions = {}) {

    const { useDefault, propTransform } = { ...defaultGetValOptions, ...options };
    const objKey = propTransform(prop as string);
    let val: any;

    if (objKey in obj) {
        val = obj[objKey];
    } else {
        if (!useDefault) return undefined;
        val = schema[prop].default;
    }

    try {
        return parseItem(prop, val, schema);

    } catch (err) {
        if (err.name !== SchemaValidationError.name) throw err;

        throw new UserError(`Error in configuration: expected type ${err.expectedType} ` +
            `for property '${objKey}' but got '${val}' (type ${typeof val})`);
    }
}
