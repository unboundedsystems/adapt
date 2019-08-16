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

import { UserError } from "@adpt/utils";
import { flags } from "@oclif/command";
import Listr = require("listr");
import { isString } from "lodash";
import path from "path";
import { parse } from "semver";
import { AdaptBase } from "../../base";
import { createStarter } from "../../proj";
import { gitUsesOpenSsh, withGitSshCommand } from "../../proj/ssh";

const logString = (task: Listr.ListrTaskWrapper) => (msg: string) => task.output = msg;

export default class NewCommand extends AdaptBase {
    static description = "Create a new Adapt project";
    static aliases = [ "new" ];

    static examples = [
        `Create a new project into the directory './myproj' using the starter ` +
        `named 'blank' from the Adapt starter gallery:\n` +
        `    $ adapt <%- command.id %> blank myproj`,
    ];

    static flags = {
        ...AdaptBase.flags,
        adaptVersion: flags.string({
            description:
                "[default: <adapt CLI version>] " +
                "Attempt to select a starter that is compatible with this " +
                "version of Adapt. Must be a valid semver."
        }),
        sshHostKeyCheck: flags.string({
            description:
                "Sets the ssh StrictHostKeyChecking option when using the " +
                "ssh protocol for fetching a starter from a remote git " +
                "repository. Defaults to 'yes' if OpenSSH is detected, " +
                "'unset' otherwise.",
            options: [ "yes", "no", "ask", "accept-new", "off", "unset" ],
            default: () => gitUsesOpenSsh() ? "yes" : "unset",
        }),
    };

    static strict = false;
    static args = [
        {
            name: "starter",
            required: true,
            description: `Adapt starter to use. May be the name of a starter ` +
                `from the starter gallery, a URL, a local file path, or most ` +
                `formats supported by npm.`
        },
        {
            name: "directory",
            default: ".",
            description: `Directory where the new project should be created. ` +
                `The directory will be created if it does not exist.`
        }
    ];

    static usage = [
        "<%- command.id %> STARTER [DIRECTORY]",
        "<%- command.id %> STARTER DIRECTORY [STARTER_ARGS...]",
    ];

    async init() {
        await super.init();
        this.parse();
    }

    async run() {
        const spec = this.args.starter;
        const dest = this.args.directory;
        const args = this.cmdArgv.length >= 3 ? this.cmdArgv.slice(2) : [];
        const f = this.flags(NewCommand);
        const adaptVerString = f.adaptVersion || this.config.version;

        if (!spec) {
            throw new UserError(`Missing 1 required arg:\nstarter\nSee more help with --help`);
        }
        if (!dest || !isString(dest)) {
            throw new UserError(`Directory argument is not a string`);
        }
        const adaptVersion = parse(adaptVerString);

        if (!adaptVersion) {
            throw new UserError(`Adapt version '${adaptVerString}' must be ` +
                `a valid semver string (Example: 1.0.1)`);
        }

        const sshHostKeyCheck = f.sshHostKeyCheck || "unset";
        if (sshHostKeyCheck === "ask") this.interactive = true;

        const starter = createStarter({
            adaptVersion,
            args,
            destDir: path.resolve(dest),
            spec,
        });
        try {
            await starter.init();

            const tasks = new Listr(this.outputSettings.listrOptions);
            tasks.add([
                {
                    title: "Downloading starter",
                    enabled: () => !starter.isLocal,
                    task: (_ctx, task) => starter.download(logString(task)),
                },
                {
                    title: "Creating new project",
                    task: (_ctx, task) => starter.run(logString(task)),
                },
            ]);

            await withGitSshCommand(sshHostKeyCheck, () => tasks.run());

        } finally {
            await starter.cleanup();
        }
    }
}
