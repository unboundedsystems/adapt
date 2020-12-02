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

import { IConfig } from "@oclif/config";
import { Help, HelpOptions } from "@oclif/plugin-help";
// tslint:disable-next-line: no-submodule-imports
import { compact, sortBy, uniqBy } from "@oclif/plugin-help/lib/util";

export interface HelpConfig {
    showAliases?: string[];
}

export default class CustomHelp extends Help {
    hConfig: HelpConfig;

    constructor(public config: IConfig, opts: Partial<HelpOptions> = {}) {
        super(config, opts);
        this.hConfig = (this.config.pjson.oclif as any).help || {};
    }

    get aliasCommands() {
        if (!this.hConfig.showAliases) return [];
        return compact(this.hConfig.showAliases.map((a) => {
            const cmd = this.config.findCommand(a);
            if (!cmd) return undefined;
            return {
                ...cmd,
                id: a, // Change the id to the alias
            };
        }));
    }

    protected get sortedCommands() {
        let commands = this.config.commands.concat(this.aliasCommands);

        commands = commands.filter((c) => this.opts.all || !c.hidden);
        commands = sortBy(commands, (c) => c.id);
        commands = uniqBy(commands, (c) => c.id);

        return commands;
    }
}
