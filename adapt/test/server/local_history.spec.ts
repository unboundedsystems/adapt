import { mochaTmpdir } from "@usys/testutils";
import * as fs from "fs-extra";
import JsonDB from "node-json-db";
import * as path from "path";
import should from "should";

import { HistoryEntry, HistoryStatus } from "../../src/server/history";
import {
    createLocalHistoryStore,
    dataDirName,
    domFilename,
    infoFilename,
    observationsFilename,
    stateFilename,
} from "../../src/server/local_history";

async function initLocalHistory() {
    const db = new JsonDB("db.json", true, true);
    const hs = await createLocalHistoryStore(db, "/deployments/dep1",
        process.cwd(), true);
    return { hs, db };
}

async function historyDirs(holdingLock = false, dirname = "."): Promise<string[]> {
    const rootFiles = await fs.readdir(".");
    const expectedFiles = holdingLock ?
        [ "dataDir.uncommitted", "dataDir.uncommitted.lock", "db.json" ] :
        [ "db.json" ];
    const actualFiles: string[] = [];

    const histFiles = rootFiles.filter((f) => {
        switch (f) {
            case "db.json":
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
    mochaTmpdir.each("adapt-test-statehistory");

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
        should(dataDir).equal(path.join(process.cwd(), dataDirName + ".uncommitted"));
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

        const hDirs = await historyDirs(true);
        should(hDirs).have.length(1);

        const domXml = await fs.readFile(path.resolve(hDirs[0], domFilename));
        const stateJson = await fs.readFile(path.resolve(hDirs[0], stateFilename));
        const observationsJson = await fs.readFile(path.resolve(hDirs[0], observationsFilename));
        const info = await fs.readJson(path.resolve(hDirs[0], infoFilename));
        const committedDataDir = path.resolve(hDirs[0], dataDirName);
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
        should(dataDir).equal(path.join(process.cwd(), dataDirName + ".uncommitted"));
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
        let hDirs = await historyDirs(true);
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
        hDirs = await historyDirs(false);
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
