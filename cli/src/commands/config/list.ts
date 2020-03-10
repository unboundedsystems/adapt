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

import { InternalError } from "@adpt/utils";
import { flags } from "@oclif/command";
import { cli, Table } from "cli-ux";
import { AdaptBase } from "../../base";
import { config } from "../../config";
import { loadUserConfig, UserConfigDetail } from "../../config/load";

// Table lines are made up of:
// - Optional bold start and bold end
// - Optional trailing whitespace (before the bold end)
// - Possibly empty text
const printLineRe = /^(\u001b\[1m)?(.*?) *(\u001b\[22m)?$/;

// Function used to replace the default cli.table printLine
// This fixes two warts with cli.table:
// - Table lines always have trailing spaces
// - Header text always contains ANSI bold sequences, even for non-tty output
function printLine(line: string) {
    const m = printLineRe.exec(line);
    if (!m) {
        throw new InternalError(
            `Output line should have matched regular expression (line=${line})`);
    }

    line = process.stdout.isTTY ?
        (m[1] || "") + m[2] + (m[3] || "") : m[2];
    process.stdout.write(line + "\n");
}

export default class ConfigListCommand extends AdaptBase {
    static description = "Shows Adapt configuration settings";

    static flags = {
        all: flags.boolean({
            description: "Show all configuration items, including defaults",
        }),
        source: flags.boolean({
            description: "Show the source of each configuration item's value",
        }),
        ...cli.table.flags({ only: ["no-truncate"] }),
        ...AdaptBase.flags
    };

    async run() {
        const f = this.parse(ConfigListCommand).flags;

        const { userConfigFile } = await config();
        const items = (await loadUserConfig(userConfigFile)).details;

        const data = Object.entries(items)
            .filter(hasDetails)
            .filter(([_name, item]) => f.all || item.sourceType !== "Default")
            .filter(([_name, item]) => item.valid)
            .map(([name, item]) => ({
                name,
                source: item.sourceType === "File" ? item.source : item.sourceType,
                value: item.store,
            }));

        const cols: Table.table.Columns<typeof data[0]> = {
            name: {},
            value: {},
        };
        if (f.source) cols.source = {};

        // tslint:disable-next-line: no-console
        cli.table(data, cols, {
            ...f,
            printLine,
            "no-header": f.quiet,
        });
    }

}

function hasDetails(entry: [string, UserConfigDetail | undefined]): entry is [string, UserConfigDetail] {
    return entry[1] != null;
}
