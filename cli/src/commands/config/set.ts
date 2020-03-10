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

import { createJson5Writer, isObject, UserError } from "@adpt/utils";
import { AdaptBase } from "../../base";
import {
    config,
    lookupConfigProperty,
    parseConfigItemString,
    SchemaValidationError,
    throwConfigFileError,
    userConfigProps,
} from "../../config";

export default class ConfigSetCommand extends AdaptBase {
    static description = "Modify Adapt configuration settings";

    static examples = [
        `Change the upgrade check notification to use the "next" channel:
    $ adapt config:set upgradeChannel next`,
    ];

    static flags = {
        ...AdaptBase.flags
    };

    static args = [
        {
            name: "name",
            required: true,
            description:
                `The name of the configuration item to be modified\n` +
                `(not case-sensitive)`,
        },
        {
            name: "value",
            required: true,
            description: `The value to assign to the configuration item`,
        }
    ];

    async run() {
        const { args } = this.parse(ConfigSetCommand);
        const { name, value } = args;
        let toStore: any;

        const prop = lookupConfigProperty(name);
        if (!prop) {
            throw new UserError(
                `Invalid configuration setting name '${name}'. ` +
                `Expected one of: ${userConfigProps.join(", ")}`);
        }

        try {
            const item = parseConfigItemString(prop, value);
            toStore = item.store;
        } catch (err) {
            const expected = err &&
                err.name === SchemaValidationError.name &&
                err.expectedType;
            if (!expected) throw err;
            throw new UserError(`Invalid value: '${value}' is not type ${expected}`);
        }
        const { userConfigFile } = await config();

        const writer = await createJson5Writer(userConfigFile, { mustExist: false });
        const orig = writer.value === undefined ? {} : writer.value;

        if (orig == null || !isObject(orig) || Array.isArray(orig)) {
            return throwConfigFileError(userConfigFile,
                new Error(`Does not contain a single object in ` +
                    `JSON/JSON5 format (actual type=${typeof orig})`));
        }

        try {
            await writer.update({ ...orig, [prop]: toStore });
        } catch (err) {
            return throwConfigFileError(userConfigFile, err, "write");
        }
    }

}
