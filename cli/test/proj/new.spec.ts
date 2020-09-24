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

import { mochaTmpdir } from "@adpt/testutils";
import { expect } from "chai";
import "chai-as-promised";
import fs from "fs-extra";
import path from "path";
import { parse, SemVer } from "semver";
import { adaptVersionLabelPrefix, StarterConfig, trySpecs, tryVersions, updateVersions } from "../../src/proj/new";

function mkVer(v: string): SemVer {
    const parsed = parse(v, true);
    if (!parsed) throw new Error(`Invalid semver ` + v);
    return parsed;
}

describe("Project new utils", () => {

    it("tryVersions should create list of versions to try", () => {
        expect(tryVersions(mkVer("1.0.0"))).eqls([
            "1.0.0",
            "1.0",
            "1",
        ].map((v) => adaptVersionLabelPrefix + v));

        expect(tryVersions(mkVer("3.4.5"))).eqls([
            "3.4.5",
            "3.4",
            "3",
        ].map((v) => adaptVersionLabelPrefix + v));
        expect(tryVersions(mkVer("001.000.00"))).eqls([
            "1.0.0",
            "1.0",
            "1",
        ].map((v) => adaptVersionLabelPrefix + v));
        expect(tryVersions(mkVer("0.1.1-next.2"))).eqls([
            "0.1.1-next.2",
            "0.1.1",
            "0.1",
            "0",
        ].map((v) => adaptVersionLabelPrefix + v));
    });

    it("trySpecs with valid npm name should include labeled gallery and npm URLs", () => {
        const specs = trySpecs("hello-node", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `hello-node@adapt-v1.0.0`,
            `hello-node@adapt-v1.0`,
            `hello-node@adapt-v1`,
            `hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `hello-node`,
            `hello-node`,
            `hello-node`,
            `hello-node`,
        ]);
    });

    it("trySpecs with valid npm name and version should not include gallery or labels", () => {
        const specs = trySpecs("hello-node@1.2.3", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `hello-node@1.2.3`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `hello-node@1.2.3`,
        ]);
    });

    it("trySpecs with leading dot should only include specified spec", () => {
        const spec = `.${path.sep}hello-node`;
        const specs = trySpecs(spec, mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: spec,
            base: spec,
            type: "local",
        }]);
    });

    it("trySpecs for absolute paths should only include specified spec", () => {
        const specs = trySpecs(path.sep + "hello-node", mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: path.sep + "hello-node",
            base: path.sep + "hello-node",
            type: "local",
        }]);
    });

    it("trySpecs for user homedir should only include specified spec", () => {
        const specs = trySpecs("~/hello-node", mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: "~/hello-node",
            base: "~/hello-node",
            type: "local",
        }]);
    });

    it("trySpecs with git URL should include labels", () => {
        const specs = trySpecs(`git+https://gitlab.com/adpt/starters/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
        ]);
    });

    it("trySpecs with git URL and committish should only include specified spec", () => {
        const specs = trySpecs(`git+https://gitlab.com/adpt/starters/hello-node#v1`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#v1`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#v1`,
        ]);
    });

    it("trySpecs with gitlab shortcut should include labels", () => {
        const specs = trySpecs(`gitlab:adpt/starters/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `gitlab:adpt/starters/hello-node#adapt-v1.0.0`,
            `gitlab:adpt/starters/hello-node#adapt-v1.0`,
            `gitlab:adpt/starters/hello-node#adapt-v1`,
            `gitlab:adpt/starters/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
        ]);
    });

    it("trySpecs with github extra shortcut should include labels", () => {
        const specs = trySpecs(`adpt/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `adpt/hello-node#adapt-v1.0.0`,
            `adpt/hello-node#adapt-v1.0`,
            `adpt/hello-node#adapt-v1`,
            `adpt/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `adpt/hello-node`,
            `adpt/hello-node`,
            `adpt/hello-node`,
            `adpt/hello-node`,
        ]);
    });

    it("trySpecs with gitlab shortcut and committish should only include specified spec", () => {
        const specs = trySpecs(`gitlab:adpt/starters/hello-node#v1`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `gitlab:adpt/starters/hello-node#v1`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `gitlab:adpt/starters/hello-node#v1`,
        ]);
    });

    it("trySpecs with invalid npm name should include gallery but no npm URLs", () => {
        const specs = trySpecs("_hello-node", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `_hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `_hello-node`,
        ]);
    });
});

const nullLogger = () => {/* */};

describe("Project new updateVersions", () => {
    mochaTmpdir.each("adapt-test-cli-updateversions");

    async function writeOrig(dir: string, orig: any) {
        await fs.mkdirp(path.resolve(dir));
        await fs.writeJson(path.resolve(dir, "package.json"), orig);
    }

    async function updateOne(config: StarterConfig, ver: string, expected: any) {
        const adaptDir = config.adaptDir;
        if (!adaptDir) throw new Error(`Must specify an adaptDir`);
        if (Array.isArray(adaptDir)) throw new Error(`updateOne doesn't handle multiple dirs`);

        await updateVersions(config, nullLogger, process.cwd(), mkVer(ver));
        const actual = await fs.readJson(path.resolve(adaptDir, "package.json"));
        expect(actual).eqls(expected);
    }

    it("Should update dependencies", async () => {
        const ver = "0.10.1-next.1";
        const orig = {
            dependencies: {
                "@adpt/core": "CURRENT",
                "@adpt/cloud": "CURRENT",
                "@adpt/cli": "CURRENT",
                "@adpt/utils": "CURRENT",
                "@adpt/testutils": "CURRENT",
                "foo": "1.2.3",
            },
            devDependencies: {
                "@adpt/core": "CURRENT",
                "@adpt/cloud": "CURRENT",
                "@adpt/cli": "CURRENT",
                "@adpt/utils": "CURRENT",
                "@adpt/testutils": "CURRENT",
                "bar": "1.2.3",
            }
        };
        const expected = {
            dependencies: {
                "@adpt/core": ver,
                "@adpt/cloud": ver,
                "@adpt/cli": ver,
                "@adpt/utils": ver,
                "@adpt/testutils": "CURRENT",
                "foo": "1.2.3",
            },
            devDependencies: {
                "@adpt/core": ver,
                "@adpt/cloud": ver,
                "@adpt/cli": ver,
                "@adpt/utils": ver,
                "@adpt/testutils": "CURRENT",
                "bar": "1.2.3",
            }
        };
        await writeOrig("deploy", orig);
        await updateOne({ adaptDir: "deploy" }, ver, expected);
    });

    it("Should handle no dependencies", async () => {
        const ver = "0.10.1-next.1";
        const orig = {};
        await writeOrig("deploy", orig);
        await updateOne({ adaptDir: "deploy" }, ver, orig);
    });

    it("Should handle no package.json", async () => {
        // This should do nothing, including not throw an error
        await updateVersions({ adaptDir: "deploy" }, nullLogger, process.cwd(),
            mkVer("1.0.0"));
    });

    it("Should error on invalid package.json values", async () => {
        const invalid = [
            null,
            "a string",
            [],
            10,
            true,
        ];

        for (const val of invalid) {
            await writeOrig("deploy", val);
            // Types are incorrect for rejectedWith. It is a promise.
            // tslint:disable-next-line: await-promise
            await expect(updateVersions({ adaptDir: "deploy" }, nullLogger,
                process.cwd(), mkVer("1.0.0")))
                .to.be.rejectedWith(`Invalid package.json file ` +
                    `'${process.cwd()}/deploy/package.json': file must ` +
                    `contain a single object`, `Failed with invalid value ${val}`);
        }
    });
});
