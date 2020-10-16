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

import { stringifyJson5 } from "@adpt/utils";
import { IConfig } from "@oclif/config";
import dedent from "dedent";
import fs from "fs-extra";
import path from "path";
import { config } from "../../../src/config";
import { clitest, expect } from "../../common/fancy";

// Should always be false when committed
const debugOutput = false;

const basicTestChain =
    clitest
    .stdout({ print: debugOutput })
    .stderr({ print: debugOutput })
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

interface WriteConfigOptions {
    filename?: string;
    finalNewline?: boolean;
}

const defaultWriteConfigOptions = {
    filename: "config.json5",
    finalNewline: true,
};

const booleanKey = "upgradeCheck";
const durationKey = "upgradeCheckInterval";

const writeConfig = (val: any, options: WriteConfigOptions = {}) =>
    async (ctx: { config: IConfig }) => {
        const { filename, finalNewline } = { ...defaultWriteConfigOptions, ...options };
        const file = path.join(ctx.config.configDir, filename);
        if (typeof val !== "string") val = stringifyJson5(val, { space: 2 });
        if (finalNewline) val += "\n";
        await fs.ensureDir(ctx.config.configDir);
        await fs.writeFile(file, val);
    };

async function checkConfig(expected: string) {
    const cfg = await config();
    const userConfigFile = cfg.userConfigFile;
    expect(await fs.pathExists(userConfigFile)).to.be.true;
    const contents = (await fs.readFile(userConfigFile)).toString();
    expect(contents).equals(expected);
}

describe("config:set", () => {

    basicTestChain
    .command(["config:set", booleanKey, "true"])
    .it("Should create .json5 config file", async (ctx) => {
        const cfg = await config();
        const userConfigFile = cfg.userConfigFile;
        expect(userConfigFile).equals(path.join(ctx.config.configDir, "config.json5"));
        await checkConfig(dedent
            `{
              ${booleanKey}: true
            }
            ` + "\n");
    });

    basicTestChain
    .command(["config:set", booleanKey, "yes"])
    .it("Should translate alternate boolean form", async () => {
        await checkConfig(dedent
            `{
              ${booleanKey}: true
            }
            ` + "\n");
    });

    basicTestChain
    .command(["config:set", durationKey, "1d"])
    .it("Should not translate duration string", async () => {
        await checkConfig(dedent
            `{
              ${durationKey}: "1d"
            }
            ` + "\n");
    });

    basicTestChain
    .command(["config:set", durationKey.toLowerCase(), "2d"])
    .it("Should allow lower case property names", async () => {
        // Confirm that durationKey actually is mixed case, in case the
        // property name changes in the future.
        expect(durationKey.toLowerCase()).does.not.equal(durationKey);

        await checkConfig(dedent
            `{
              ${durationKey}: "2d"
            }
            ` + "\n");
    });

    basicTestChain
    .loadConfig()
    .do(writeConfig(dedent
        `// My config file
        {
            foo: 1
        }`))
    .command(["config:set", booleanKey, "true"])
    .it("Should update JSON5 config", async () => {
        await checkConfig(dedent
            `// My config file
            {
                foo: 1,
                ${booleanKey}: true
            }
            ` + "\n");
    });

    basicTestChain
    .loadConfig()
    .do(writeConfig(dedent
        `{
            "foo": 1
        }`))
    .command(["config:set", booleanKey, "true"])
    .it("Should update JSON config", async () => {
        await checkConfig(dedent
            `{
                "foo": 1,
                "${booleanKey}": true
            }
            ` + "\n");
    });

    basicTestChain
    .loadConfig()
    .do(writeConfig(dedent
        `// My config file
        {
            foo: 1
        }`, { filename: "config.json" }))
    .command(["config:set", booleanKey, "true"])
    .it("Should update config.json", async (ctx) => {
        const cfg = await config();
        const userConfigFile = cfg.userConfigFile;
        expect(userConfigFile).equals(path.join(ctx.config.configDir, "config.json"));
        expect(await fs.pathExists(path.join(ctx.config.configDir, "config.json5"))).to.be.false;
        await checkConfig(dedent
            `// My config file
            {
                foo: 1,
                ${booleanKey}: true
            }
            ` + "\n");
    });

    /*
     * Error tests
     */
    let configDir: string;

    basicTestChain
    .command(["config:set"])
    .catch((err) => {
        expect(err.message).matches(/Missing 2 required args:/);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if not enough args");

    basicTestChain
    .command(["config:set", "foo", "true"])
    .catch((err) => {
        expect(err.message).matches(
            RegExp(`^Invalid configuration setting name 'foo'. ` +
                `Expected one of:.*${booleanKey}`));
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on invalid key name");

    basicTestChain
    .command(["config:set", booleanKey, "10"])
    .catch((err) => {
        expect(err.message).matches(/Invalid value: '10' is not type boolean/);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on invalid boolean");

    basicTestChain
    .command(["config:set", durationKey, "abc"])
    .catch((err) => {
        expect(err.message).matches(/Invalid value: 'abc' is not type duration/);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on invalid duration");

    basicTestChain
    .loadConfig()
    .do((ctx) => configDir = ctx.config.configDir)
    .do(writeConfig("{foo=1}"))
    .command(["config:set", booleanKey, "true"])
    .catch((err) => {
        expect(err.message).equals(dedent
            `Config file '${configDir + path.sep}config.json5': Invalid JSON5 format: invalid character '=' at line 1, column 5:
            {foo=1}
                ^-- error here`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on invalid JSON5 in config file");

    basicTestChain
    .loadConfig()
    .do((ctx) => configDir = ctx.config.configDir)
    .do(writeConfig("12"))
    .command(["config:set", booleanKey, "true"])
    .catch((err) => {
        expect(err.message).equals(
            `Config file '${configDir + path.sep}config.json5': Does not contain a ` +
            `single object in JSON/JSON5 format (actual type=number)`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on non-object in config file");

});
