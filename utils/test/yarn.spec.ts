/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import should from "should";
import { run } from "../src/yarn/common";

const errRegex = (cmd: string) => RegExp(
    `^yarn ${cmd} failed: Command failed with exit code 1: yarn ${cmd} --no-progress\n` +
    `yarn run v\\d.\\d+.\\d+\n` +
    `error Command "${cmd}" not found.\n` +
    `info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.\n$`
);

describe("yarn run", function () {
    this.slow(500);

    it("should run command successfully", async () => {
        const retP = run("versions", {});

        // Check that retP is a ChildProcess
        should(retP.kill).be.a.Function();
        should(retP.pid).be.a.Number();

        const ret = await retP;

        // Check that ret is an ExecaReturns
        should(ret.command).be.a.String();
        should(ret.exitCode).equal(0);
        should(ret.failed).equal(false);

        should(ret.stdout).match(/node:/);
        should(ret.stdout).match(/v8:/);
    });

    it("should transform error on catch", async () => {
        const retP = run("foo", {});
        await retP.catch((err) => {
            should(err.message).match(errRegex("foo"));
        });
    });

    it("should transform error on then", async () => {
        const retP = run("foo2", {});
        await retP.then(
            (_val) => {
                throw new Error("Should not get here");
            },
            (err) => {
                should(err.message).match(errRegex("foo2"));
            });
    });

    it("should transform error on await", async () => {
        try {
            await run("foo3", {});
            throw new Error("Should not get here");
        } catch (err) {
            should(err.message).match(errRegex("foo3"));
        }
    });

});
