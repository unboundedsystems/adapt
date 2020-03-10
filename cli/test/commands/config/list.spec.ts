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

import dedent from "dedent";
import path from "path";
import { clitest, clitestBase, expect } from "../../common/fancy";

// Should always be false when committed
const debugOutput = false;

const basicTestChain = clitest
    .stdout({ print: debugOutput })
    .stderr({ print: debugOutput })
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

const fakeTermWidth = 80;

const ttyTestChain = clitest
    .stdout({ print: debugOutput })
    .stderr({ print: debugOutput })
    .stub(process.stdout, "isTTY", true)
    .stub(process.stdout, "getWindowSize", () => [fakeTermWidth, 40]);

// clitest has a config environment variable set, so use this for a
// completely empty config
const noConfigTestChain = clitestBase
    .xdgdirs()
    .stdout({ print: debugOutput })
    .stderr({ print: debugOutput })
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

describe("config:list", () => {

    noConfigTestChain
        .command(["config:list"])
        .it("Should list empty config", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            Name Value
            ` + "\n");
    });

    basicTestChain
        .command(["config:list"])
        .it("Should list config with default clitest environment config", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            Name         Value
            upgradeCheck false
            ` + "\n");
    });

    basicTestChain
        .command(["config:list", "-q"])
        .it("Should list config without headers", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            upgradeCheck false
            ` + "\n");
    });

    basicTestChain
        .command(["config:set", "upgradeCheckInterval", "1d"])
        .command(["config:list"])
        .it("Should list item configured in file", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            Name                 Value
            upgradeCheck         false
            upgradeCheckInterval 1d
            ` + "\n");
    });

    basicTestChain
        .command(["config:list", "--all"])
        .it("Should list defaults", async (ctx) => {
        expect(ctx.stdout).matches(
            /upgradeCheckInterval\s+1 day.*upgradeRemindInterval\s+7 days/s
        );
    });

    const longUrl = "https://example.com/" + "X".repeat(100);
    const truncUrl = longUrl.slice(0, fakeTermWidth - "upgradeCheckUrl".length - 3);

    ttyTestChain
        .command(["config:set", "-q", "upgradeCheckUrl", longUrl])
        .command(["config:list", "-q"])
        .it("Should truncate long values for tty", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            upgradeCheck    false
            upgradeCheckUrl ${truncUrl}…
            ` + "\n");
    });

    ttyTestChain
        .command(["config:set", "-q", "upgradeCheckUrl", longUrl])
        .command(["config:list", "-q", "--no-truncate"])
        .it("Should not truncate long values with --no-truncate", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            upgradeCheck    false
            upgradeCheckUrl ${longUrl}
            ` + "\n");
    });

    basicTestChain
        .command(["config:set", "-q", "upgradeCheckUrl", longUrl])
        .command(["config:list", "-q"])
        .it("Should not truncate long values with no tty", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            upgradeCheck    false
            upgradeCheckUrl ${longUrl}
            ` + "\n");
    });

    basicTestChain
        .command(["config:set", "upgradeCheckInterval", "1d"])
        .command(["config:list", "--source"])
        .it("Should show source of config values", async (ctx) => {
        expect(ctx.stdout).equals(dedent`
            Name                 Value Source
            upgradeCheck         false Environment
            upgradeCheckInterval 1d    ${path.join(ctx.config.configDir, "config.json5")}
            ` + "\n");
    });

    basicTestChain
        .command(["config:set", "upgradeCheckInterval", "1d"])
        .command(["config:list", "--source", "--all"])
        .it("Should show source of config values with defaults", async (ctx) => {
        expect(ctx.stdout).matches(RegExp(`Name\\s+Value\\s+Source`, "s"));
        expect(ctx.stdout).matches(RegExp([
            `Name\\s+Value\\s+Source`,
            `upgradeCheck\\s+false\\s+Environment`,
            `upgradeCheckInterval\\s+1d\\s+${path.join(ctx.config.configDir, "config.json5")}`,
            `upgradeRemindInterval\\s+7 days\\s+Default`
        ].join(".*"), "s"));
    });
});
