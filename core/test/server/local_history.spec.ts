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

import { mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import JsonDB from "node-json-db";
import * as path from "path";
import should from "should";

import { HistoryEntry, HistoryStatus, HistoryStore } from "../../src/server/history";
import {
    createLocalHistoryStore,
    dataDirName,
    domFilename,
    infoFilename,
    observationsFilename,
    stateFilename,
} from "../../src/server/local_history";

async function historyDirs(holdingLock = false, dirname: string): Promise<string[]> {
    const rootFiles = await fs.readdir(dirname);
    const expectedFiles = holdingLock ?
        [ "dataDir.uncommitted", "dataDir.uncommitted.lock" ] : [];
    const actualFiles: string[] = [];

    const histFiles = rootFiles.filter((f) => {
        switch (f) {
            case "dataDir.uncommitted":
            case "dataDir.uncommitted.lock":
                actualFiles.push(f);
                return false;
        }
        return true;
    });
    should(actualFiles).eql(expectedFiles);
    return histFiles;
}

describe("Local history store tests", () => {
    let hs_: HistoryStore | undefined;

    function historyRoot() {
        return path.join(process.cwd(), "history");
    }

    async function initLocalHistory() {
        const db = new JsonDB(path.resolve("db.json"), true, true);
        hs_ = await createLocalHistoryStore(db, "/deployments/dep1",
            historyRoot(), true);
        return { db, hs: hs_ };
    }

    mochaTmpdir.each("adapt-test-statehistory");
    afterEach("cleanup history", async () => {
        if (!hs_) return;
        await hs_.destroy();
        hs_ = undefined;
    });

    it("Should init and destroy history dir", async () => {
        should(await fs.pathExists(historyRoot())).be.False();
        const { hs } = await initLocalHistory();
        should(await fs.pathExists(historyRoot())).be.True();
        await hs.destroy();
        should(await fs.pathExists(historyRoot())).be.False();
    });

    it("Should destroy history dir when locked", async () => {
        should(await fs.pathExists(historyRoot())).be.False();
        const { hs } = await initLocalHistory();
        should(await fs.pathExists(historyRoot())).be.True();

        const dataDir = await hs.getDataDir(HistoryStatus.complete);
        should(await fs.pathExists(dataDir)).be.True();
        const lockPath = path.join(historyRoot(), dataDirName + ".uncommitted.lock");
        should(await fs.pathExists(lockPath)).be.True();

        await hs.destroy();
        should(await fs.pathExists(historyRoot())).be.False();
    });

    it("Should init a local history and write entries", async () => {
        const { hs, db } = await initLocalHistory();
        const last = await hs.last(HistoryStatus.complete);
        should(last).be.Undefined();

        const origInfo = {
            fileName: "somefile.tsx",
            projectRoot: "/somedir",
            stackName: "mystack",
        };
        const dataDir = await hs.getDataDir(HistoryStatus.complete);
        should(dataDir).equal(path.join(historyRoot(), dataDirName + ".uncommitted"));
        should(await fs.pathExists(dataDir)).be.True();

        await fs.writeFile(path.join(dataDir, "testfile"), "this is a test");

        const entry: HistoryEntry = {
            dataDir,
            domXml: "<Adapt/>",
            stateJson: `{"stateJson":true}`,
            observationsJson: `{ "test": { data: { "foo": 1 }, context: {"bar": 1}  } }`,
            status: HistoryStatus.preAct,
            ...origInfo
        };
        await hs.commitEntry(entry);

        const hDirs = await historyDirs(true, historyRoot());
        should(hDirs).have.length(1);

        const dir = path.join(historyRoot(), hDirs[0]);
        const domXml = await fs.readFile(path.join(dir, domFilename));
        const stateJson = await fs.readFile(path.join(dir, stateFilename));
        const observationsJson = await fs.readFile(path.join(dir, observationsFilename));
        const info = await fs.readJson(path.join(dir, infoFilename));
        const committedDataDir = path.join(dir, dataDirName);
        const testfile = await fs.readFile(path.join(committedDataDir, "testfile"));

        should(domXml.toString()).equal(entry.domXml);
        should(stateJson.toString()).equal(entry.stateJson);
        should(observationsJson.toString()).equal(entry.observationsJson);
        should(info).eql({
            ...origInfo,
            status: "preAct",
            dataDir: committedDataDir,
        });
        should(testfile.toString()).equal("this is a test");

        should(db.getData("/deployments/dep1")).eql({
            stateDirs: hDirs
        });
    });

    it("Should reconstitute previous dataDir", async () => {
        const { hs } = await initLocalHistory();
        const last = await hs.last(HistoryStatus.complete);
        should(last).be.Undefined();

        const origInfo = {
            fileName: "somefile.tsx",
            projectRoot: "/somedir",
            stackName: "mystack",
        };
        let dataDir = await hs.getDataDir(HistoryStatus.complete);
        should(dataDir).equal(path.join(historyRoot(), dataDirName + ".uncommitted"));
        should(await fs.pathExists(dataDir)).be.True();

        await fs.writeFile(path.join(dataDir, "testfile"), "this is a test");

        const entry: HistoryEntry = {
            dataDir,
            domXml: "<Adapt/>",
            stateJson: `{"stateJson":true}`,
            observationsJson: `{ "test": { data: { "foo": 1 }, context: {"bar": 1}  } }`,
            status: HistoryStatus.preAct,
            ...origInfo
        };
        await hs.commitEntry(entry);

        // preAct commit complete. dataDir should still be there.
        let hDirs = await historyDirs(true, historyRoot());
        should(hDirs).have.length(1);
        should(await fs.pathExists(dataDir)).be.True();

        await should(hs.getDataDir(HistoryStatus.complete))
            .be.rejectedWith(/attempting to lock dataDir.*twice/);

        // Update stuff in the dataDir
        await fs.writeFile(path.join(dataDir, "testfile"), "this has been updated");

        // And commit
        await hs.commitEntry({
            ...entry,
            status: HistoryStatus.success,
        });

        // success commit complete. dataDir should be gone.
        hDirs = await historyDirs(false, historyRoot());
        should(hDirs).have.length(2);
        should(await fs.pathExists(dataDir)).be.False();

        // Try to reconstitute the preAct state
        dataDir = await hs.getDataDir(HistoryStatus.preAct);
        let testfile = await fs.readFile(path.join(dataDir, "testfile"));
        should(testfile.toString()).equal("this is a test");

        await hs.releaseDataDir();

        // Commit aborted. dataDir should be gone.
        should(await fs.pathExists(dataDir)).be.False();

        // Now try to reconstitute the successful state
        dataDir = await hs.getDataDir(HistoryStatus.complete);
        testfile = await fs.readFile(path.join(dataDir, "testfile"));
        should(testfile.toString()).equal("this has been updated");

        await hs.releaseDataDir();

        // Commit aborted. dataDir should be gone.
        should(await fs.pathExists(dataDir)).be.False();
    });
});
