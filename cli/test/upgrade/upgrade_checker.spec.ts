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

import { mochaExpress, mochaTmpdir } from "@adpt/testutils";
import { MaybeArray, readJson5, toArray, waitForNoThrow } from "@adpt/utils";
import db from "debug";
import dedent from "dedent";
import fs from "fs-extra";
import path from "path";
import which from "which";
import { userConfigSchema } from "../../src/config/config";
import { createState } from "../../src/config/load";
import { hasSecurityFixes, UpgradeChecker, UpgradeCheckerConfig } from "../../src/upgrade/upgrade_checker";
import { VersionSummary } from "../../src/upgrade/versions";
import { clitest, expect } from "../common/fancy";

// tslint:disable-next-line: no-var-requires
const pjson = require("../../../package.json");

const ONE_HOUR = 60 * 60 * 1000;

const showOutput = false;

const basicTestChain =
    clitest
    .stdout({ print: showOutput })
    .stderr({ print: showOutput })
    // fancy-test types are incorrect. See https://github.com/oclif/fancy-test/issues/113
    .stub(process.stdout, "isTTY", false as any); // Turn off progress, etc

const ttyTestChain =
    clitest
    .stdout({ print: showOutput })
    .stderr({ print: showOutput })
    // fancy-test types are incorrect. See https://github.com/oclif/fancy-test/issues/113
    .stub(process.stdout, "isTTY", true as any); // Turn on upgrade output

const testDebugOutput =
    basicTestChain
    .add("savedDebugs", () => {
        const saved = db.disable();
        db.enable(saved + saved ? "," : "" + "adapt:upgrade");
        return saved;
    })
    .finally((ctx) => db.enable(ctx.savedDebugs));

const mockUpgradePath = "/path/to/check";

const latest101: VersionSummary = {
    name: "@adpt/cli",
    channelCurrent: {
        latest: "1.0.1",
        next: "1.0.2-next.1",
        security: "1.0.1-security.1",
        both: "1.0.1-both.1",
    },
    versions: {
        "1.0.1": {
            channel: "latest",
            description: "Fixes for FooCloud",
        },
        "1.0.2-next.1": {
            channel: "next",
            description: "Some new feature work",
        },
        "1.0.1-security.1": {
            channel: "security",
            securityFixes: true,
        },
        "1.0.1-both.1": {
            channel: "both",
            description: "Some new feature work",
            securityFixes: true,
        }
    }
};

const badChannelCurrent = { ...latest101 };
(badChannelCurrent as any).channelCurrent = "badvalue";

async function readStateJson() {
    return readJson5(".state.json");
}

async function readUpgradeLog() {
    const buf = await fs.readFile("upgrade-check.log");
    return buf.toString();
}

// Examples: 19.03.5 18.09.9-ce
const dockerVerRegex = "\\d+\\.\\d+\\.\\d+(?:-[a-z]+)?";

// Example: v10.15.3
const nodeVerRegex = "v\\d+\\.\\d+\\.\\d+";

interface UaOptions {
    docker?: "client" | "both";
    dev?: boolean;
}

function uaRegex(options: UaOptions = {}) {
    const { docker, dev } = options;
    const name = pjson.name.replace(/\//g, "-");
    const dockerRe =
        docker === "client" ? ` Docker/${dockerVerRegex}` :
        docker === "both" ? ` Docker/${dockerVerRegex}\\+${dockerVerRegex}` :
        "";
    const devRe = dev ? ` Dev/${dev}` : "";
    const platform = process.platform === "win32" ? "Windows_NT" : "Linux"; // Only Windows runs tests without Docker
    const re = `^${name}/1.0.0 ${platform}/[^ ]+-x64 Node/${nodeVerRegex}${devRe}${dockerRe}$`;
    return RegExp(re);
}

function removeExesFromPath(exes: string[]): string {
    const pathSet = new Set(process.env.PATH!.split(path.delimiter));

    for (const exe of exes) {
        const absExes = which.sync(exe, { all: true, nothrow: true });
        if (!absExes) continue;
        for (const absExe of absExes) {
            pathSet.delete(path.dirname(absExe));
        }
    }
    return [...pathSet].join(path.delimiter);
}

const pathNoGitOrDocker = removeExesFromPath(["docker", "git"]);

function expressSaveRequests(fixture: mochaExpress.ExpressFixture, route: string, response: any) {
    const headerList: mochaExpress.Request[] = [];
    fixture.app.get(route, (req, res) => {
        headerList.push(req);
        res.send(response);
    });
    return headerList;
}

describe("UpgradeChecker", function () {
    let state: ReturnType<typeof createState>;
    let ucConfig: UpgradeCheckerConfig;

    this.slow(3 * 1000);
    this.timeout(10 * 1000);
    mochaTmpdir.each("adapt-cli-test-upgrade");

    const mockServer = mochaExpress.each();

    beforeEach(() => {
        state = createState(process.cwd());
        ucConfig = {
            channel: "latest",
            configDir: process.cwd(),
            logDir: process.cwd(),
            timeout: 1000,
            upgradeCheckInterval: 0,
            upgradeCheckUrl: mockServer.url + mockUpgradePath,
            upgradeRemindInterval: ONE_HOUR,
            upgradeIgnore: "",
        };
        state.set("version", "1.0.0");
    });

    testDebugOutput
    .it("Should not check on first run", async (ctx) => {
        // The first check will not happen until this many ms have
        // passed since createState() was called initially. For this test,
        // an hour should be sufficiently far in the future.
        ucConfig.upgradeCheckInterval = ONE_HOUR;

        const checker = new UpgradeChecker(ucConfig, state);
        await checker.check();
        expect(ctx.stderr).matches(/Not time to check/);
    });

    async function runAndCheckSuccess(expVersion?: string) {
        const origState = await readStateJson();
        expect(origState.upgrade).to.be.undefined;
        expect(origState.lastUpgradeCheck).to.be.a("number");

        const checker = new UpgradeChecker(ucConfig, state);
        await checker.check();

        await waitForNoThrow(5, 1, async () => {
            await readUpgradeLog();
            expect(checker.upgrade).is.ok;
        });
        const upgrade = checker.upgrade;
        if (!upgrade) throw expect(upgrade).to.be.ok;
        expect(upgrade.latest).to.be.a("string");
        if (expVersion) expect(upgrade.latest).equals(expVersion);

        const newState = await readStateJson();
        expect(newState.upgrade).is.ok;
        expect(newState.lastUpgradeCheck).is.greaterThan(origState.lastUpgradeCheck);
        return checker;
    }

    testDebugOutput
    .it("Should fetch upgrade URL", async (ctx) => {
        // Return a valid VersionSummary
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");
        expect(ctx.stderr).matches(/Spawning child/);

        // isTty is false, so there should be no message
        expect(await checker.notifyString()).to.be.undefined;
    });

    basicTestChain
    .it("Should send headers with Dev and Docker client+server", async () => {
        const origState = await readStateJson();
        expect(origState.installed).to.be.a("number");

        const reqs = expressSaveRequests(mockServer, mockUpgradePath, latest101);

        await runAndCheckSuccess("1.0.1");
        expect(reqs.length).is.greaterThan(0);
        const req = reqs[0];

        expect(req.headers["user-agent"]).to.match(uaRegex({
            dev: true,
            docker: "both",
        }));
        expect(req.query["x-installed"]).to.equal(origState.installed.toString());
    });

    testDebugOutput
    .env({
        PATH: pathNoGitOrDocker,
        Path: pathNoGitOrDocker,  // Ugh. Windows.
    })
    .it("Should send headers without Dev and Docker", async () => {
        const origState = await readStateJson();
        expect(origState.installed).to.be.a("number");

        const reqs = expressSaveRequests(mockServer, mockUpgradePath, latest101);

        await runAndCheckSuccess("1.0.1");
        expect(reqs.length).is.greaterThan(0);
        const req = reqs[0];

        expect(req.headers["user-agent"]).to.match(uaRegex());
        expect(req.query["x-installed"]).to.equal(origState.installed.toString());
    });

    const badDockerHost = process.platform === "win32" ? "npipe:///badhost" : "unix:///dev/null";

    testDebugOutput
    .env({ DOCKER_HOST: badDockerHost })
    .it("Should send headers with Dev and Docker client only", async () => {
        const origState = await readStateJson();
        expect(origState.installed).to.be.a("number");

        const reqs = expressSaveRequests(mockServer, mockUpgradePath, latest101);

        await runAndCheckSuccess("1.0.1");
        expect(reqs.length).is.greaterThan(0);
        const req = reqs[0];

        expect(req.headers["user-agent"]).to.match(uaRegex({
            dev: true,
            docker: "client",
        }));
        expect(req.query["x-installed"]).to.equal(origState.installed.toString());
    });

    basicTestChain
    .it("Should fetch upgrade URL from test S3", async () => {
        ucConfig.upgradeCheckUrl = "https://adpt-temp-test.s3-us-west-2.amazonaws.com/latest101";

        await runAndCheckSuccess("1.0.1");
    });

    basicTestChain
    .it("Should fetch upgrade URL from prod S3", async () => {
        ucConfig.upgradeCheckUrl = userConfigSchema.upgradeCheckUrl.default;

        await runAndCheckSuccess();
    });

    ttyTestChain
    .it("Should create message when newer version is available", async () => {
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");

        expect(await checker.notifyString()).equals(dedent
            `Upgrade available: 1.0.0 → 1.0.1

            1.0.1: Fixes for FooCloud

            Upgrade: yarn add @adpt/cli@1.0.1
            Ignore:  adapt config:set upgradeIgnore 1.0.1
            `);
    });

    ttyTestChain
    .it("Should not create message when newer version is ignored", async () => {
        ucConfig.upgradeIgnore = "1.0.1";
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");

        expect(await checker.notifyString()).is.undefined;
    });

    ttyTestChain
    .it("Should create message when user sets channel to next and newer version is available", async () => {
        ucConfig.channel = "next";
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.2-next.1");

        expect(await checker.notifyString()).equals(dedent
            `Upgrade available: 1.0.0 → 1.0.2-next.1

            1.0.2-next.1: Some new feature work

            Upgrade: yarn add @adpt/cli@1.0.2-next.1
            Ignore:  adapt config:set upgradeIgnore 1.0.2-next.1
            `);
    });

    ttyTestChain
    .it("Should create message with security fixes", async () => {
        ucConfig.channel = "security";
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1-security.1");

        expect(await checker.notifyString()).equals(dedent
            `Upgrade available: 1.0.0 → 1.0.1-security.1

            This upgrade contains security fixes

            Upgrade: yarn add @adpt/cli@1.0.1-security.1
            Ignore:  adapt config:set upgradeIgnore 1.0.1-security.1
            `);
    });

    ttyTestChain
    .it("Should create message with description and security fixes", async () => {
        ucConfig.channel = "both";
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1-both.1");

        expect(await checker.notifyString()).equals(dedent
            `Upgrade available: 1.0.0 → 1.0.1-both.1

            1.0.1-both.1: Some new feature work
            This upgrade contains security fixes

            Upgrade: yarn add @adpt/cli@1.0.1-both.1
            Ignore:  adapt config:set upgradeIgnore 1.0.1-both.1
            `);
    });

    ttyTestChain
    .it("Should not create message when same version is available", async () => {
        state.set("version", "1.0.1");
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");

        expect(await checker.notifyString()).is.undefined;
    });

    ttyTestChain
    .it("Should not create message when older version is available", async () => {
        state.set("version", "1.0.2-next.1");
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");

        expect(await checker.notifyString()).is.undefined;
    });

    ttyTestChain
    .it("Should show message once per remind interval", async () => {
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(latest101));

        const checker = await runAndCheckSuccess("1.0.1");

        const msg = dedent
            `Upgrade available: 1.0.0 → 1.0.1

            1.0.1: Fixes for FooCloud

            Upgrade: yarn add @adpt/cli@1.0.1
            Ignore:  adapt config:set upgradeIgnore 1.0.1
            `;
        expect(await checker.notifyString()).equals(msg);

        // Should not show a second time
        expect(await checker.notifyString()).is.undefined;

        // Pretend last time we showed the message was an hour ago
        state.set("lastUpgradeReminder", Date.now() - ONE_HOUR);

        // Now should get the message again
        expect(await checker.notifyString()).equals(msg);
    });

    /*
     * Error testing
     */

    async function runAndCheckError(logMatches: MaybeArray<RegExp>) {
        const matches = toArray(logMatches);
        const origState = await readStateJson();
        expect(origState.upgrade).to.be.undefined;
        expect(origState.lastUpgradeCheck).to.be.a("number");

        const checker = new UpgradeChecker(ucConfig, state);
        await checker.check();

        let log;
        // Wait for the child to fail
        await waitForNoThrow(5, 1, async () => {
            log = await readUpgradeLog();
            expect(log).matches(/FAILED: Error running upgrade check/);
        });
        for (const match of matches) {
            expect(log).matches(match);
        }

        const upgrade = checker.upgrade;
        expect(upgrade).to.be.undefined;

        const newState = await readStateJson();
        expect(newState.upgrade).is.undefined;
        expect(newState.lastUpgradeCheck).to.equal(origState.lastUpgradeCheck);

        return log;
    }

    basicTestChain // Ensure child always logs even without DEBUG set
    .it("Should log error on 404", async () => {
        // Return a 404
        mockServer.app.get(mockUpgradePath, (_req, res) => {
            res.status(404).send("Nope not here");
        });

        await runAndCheckError(/Status 404.*Nope not here/);
    });

    basicTestChain
    .it("Should log error on non-JSON response", async () => {
        mockServer.app.get(mockUpgradePath, (_req, res) => res.send("Not JSON!\n"));

        await runAndCheckError([
            /Invalid JSON response/,
            /Upgrade check response: Not JSON!\n/
        ]);
    });

    basicTestChain
    .it("Should log error on response with invalid channelCurrent", async () => {
        mockServer.app.get(mockUpgradePath, (_req, res) => res.json(badChannelCurrent));

        await runAndCheckError(/Invalid response: Invalid channelCurrent property/);
    });

    basicTestChain
    .it("Should log error on timeout", async () => {
        ucConfig.timeout = 100;
        mockServer.app.get(mockUpgradePath, (_req, res) => {
            // Delay longer than the configured timeout
            setTimeout(() => res.json(latest101), 150);
        });

        await runAndCheckError(/Error fetching version information: network timeout/);
    });
});

const secSum: VersionSummary = {
    name: "@adpt/cli",
    channelCurrent: { },
    versions: {
        "1.0.1-nofixes.0": {
            channel: "nofixes",
        },
        "1.0.1-nofixes.1": {
            channel: "nofixes",
        },

        "1.0.1-fixeslatest.0": {
            channel: "fixeslatest",
        },
        "1.0.1-fixeslatest.1": {
            channel: "fixeslatest",
            securityFixes: true,
        },

        "1.0.1-fixescurrent.0": {
            channel: "fixescurrent",
            securityFixes: true,
        },
        "1.0.1-fixescurrent.1": {
            channel: "fixescurrent",
        },

        "1.0.1-intermediate.0": {
            channel: "intermediate",
        },
        "1.0.1-intermediate.1": {
            channel: "intermediate",
            securityFixes: true,
        },
        "1.0.1-intermediate.2": {
            channel: "intermediate",
        },
    }
};

describe("hasSecurityFixes", () => {
    it("Should ignore wrong channel", () => {
        expect(hasSecurityFixes("1.0.1-nofixes.0", "1.0.1-nofixes.1", "nofixes", secSum))
            .to.be.false;
    });
    it("Should have fixes in latest", () => {
        expect(hasSecurityFixes("1.0.1-fixeslatest.0", "1.0.1-fixeslatest.1", "fixeslatest", secSum))
            .to.be.true;
    });
    it("Should not have fixes in current", () => {
        expect(hasSecurityFixes("1.0.1-fixescurrent.0", "1.0.1-fixescurrent.1", "fixescurrent", secSum))
            .to.be.false;
    });
    it("Should have fixes in intermediate releases", () => {
        expect(hasSecurityFixes("1.0.1-intermediate.0", "1.0.1-intermediate.2", "intermediate", secSum))
            .to.be.true;
    });
});
