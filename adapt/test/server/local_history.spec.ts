import { mochaTmpdir } from "@usys/utils";
import * as fs from "fs-extra";
import JsonDB = require("node-json-db");
import * as path from "path";
import * as should from "should";

import { HistoryEntry } from "../../src/server/history";
import {
    createLocalHistoryStore,
    domFilename,
    infoFilename,
    observationsFilename,
    stateFilename
} from "../../src/server/local_history";

async function initLocalHistory() {
    const db = new JsonDB("db.json", true, true);
    const hs = await createLocalHistoryStore(db, "/deployments/dep1",
        process.cwd(), true);
    return { hs, db };
}

async function historyDirs(dirname = "."): Promise<string[]> {
    const rootFiles = await fs.readdir(".");
    should(rootFiles).have.length(2);
    return rootFiles.filter((f) => f !== "db.json");
}

describe("Local history store tests", () => {
    mochaTmpdir.each("adapt-test-statehistory");

    it("Should init a local history and write entries", async () => {
        const { hs, db } = await initLocalHistory();
        const last = await hs.last();
        should(last).be.Undefined();

        const writer = await hs.writer();

        const origInfo = {
            fileName: "somefile.tsx",
            projectRoot: "/somedir",
            stackName: "mystack",
        };
        const entry: HistoryEntry = {
            domXml: "<Adapt/>",
            stateJson: `{"stateJson":true}`,
            observationsJson: `{ "test": { data: { "foo": 1 }, context: {"bar": 1}  } }`,
            ...origInfo
        };
        await writer.appendEntry(entry);

        const hDirs = await historyDirs();
        should(hDirs).have.length(1);

        const domXml = await fs.readFile(path.resolve(hDirs[0], domFilename));
        const stateJson = await fs.readFile(path.resolve(hDirs[0], stateFilename));
        const observationsJson = await fs.readFile(path.resolve(hDirs[0], observationsFilename));
        const info = await fs.readJson(path.resolve(hDirs[0], infoFilename));

        should(domXml.toString()).equal(entry.domXml);
        should(stateJson.toString()).equal(entry.stateJson);
        should(observationsJson.toString()).equal(entry.observationsJson);
        should(info).eql(origInfo);

        should(db.getData("/deployments/dep1")).eql({
            stateDirs: hDirs
        });
    });
});
