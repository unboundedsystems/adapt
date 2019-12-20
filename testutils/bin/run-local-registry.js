/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

const defaults = require("../dist/src/local-registry-defaults");
const registry = require("../dist/src/local-registry");
const utils = require("@adpt/utils");
const program = require("commander");

async function main() {
    program
        .option("--empty", "Don't load any packages into the registry");

    program.parse(process.argv);

    const storage = await utils.mkdtmp("adapt-local-registry");

    const opts = {
        ...defaults.config,
        storage,
    };

    if (program.opts().empty) {
        opts.onStart = () => defaults.setupLocalRegistry([]);
    }

    await registry.start(opts, defaults.configPath);
}

main();
