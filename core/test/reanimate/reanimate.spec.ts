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

import {
    mochaLocalRegistry,
    mochaTmpdir,
    Package,
    repoVersions,
    writePackage,
} from "@adpt/testutils";
import {
    Constructor,
    repoDirs,
    yarn,
} from "@adpt/utils";
import execa from "execa";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import should from "should";
import { packageDirs } from "../testlib";

import {
    callerModule,
    findMummy,
    findMummyUrn,
    mockRegistry_,
    MummyJson,
    MummyRegistry,
    reanimate,
    reanimateUrn,
    registerObject,
} from "../../src/reanimate/reanimate";
import * as firstBaseReg from "./test_baseReg";
import * as firstInFunc from "./test_inFunc";
import * as firstLateExport from "./test_lateExport";
import { isLiving } from "./test_living";
import * as firstVictim from "./test_victim";

const currentAdaptVersion = repoVersions.core;

const curMod = {
    victim: firstVictim,
    lateExport: firstLateExport,
    inFunc: firstInFunc,
    baseReg: firstBaseReg,
};
type Mods = typeof curMod;
type ModName = keyof Mods;
//type ModExports<Mname extends ModName> = keyof Mods[Mname];
type CtorNames<T> = { [K in keyof T]: T[K] extends Constructor<any> ? K : never }[keyof T];
type ModCtorNames<Mname extends ModName> = CtorNames<Mods[Mname]>;

function deleteModule(modName: ModName) {
    delete require.cache[curMod[modName].module.id];
}

function requireModule(modName: ModName) {
    const current = curMod[modName];
    curMod[modName] = require(`./test_${modName}`);
    // Ensure we actually got a new module
    should(curMod[modName]).not.equal(current);
}

describe("Reanimate basic tests", () => {
    let origRegistry: MummyRegistry;
    let firstMummyJ: MummyJson;

    before(() => {
        origRegistry = mockRegistry_();
    });
    after(() => {
        mockRegistry_(origRegistry);
    });

    it("Should have registered on first import", async () => {
        mockRegistry_(origRegistry);

        firstMummyJ = findMummy(firstVictim.Victim);
        should(firstMummyJ).be.type("string");

        const parsed = JSON.parse(firstMummyJ);
        should(parsed).eql({
            name: "Victim",
            namespace: "",
            pkgName: "@adpt/core",
            pkgVersion: currentAdaptVersion,
            relFilePath: "../test/reanimate/test_victim.js",
        });

        const obj = await reanimate(firstMummyJ);
        should(obj).equal(firstVictim.Victim);

        const mummyUrn = findMummyUrn(firstVictim.Victim);
        should(mummyUrn).equal(
            // tslint:disable-next-line:max-line-length
            `urn:Adapt:@adpt/core:${currentAdaptVersion}::../test/reanimate/test_victim.js:Victim`);
        const obj2 = await reanimateUrn(mummyUrn);
        should(obj2).equal(firstVictim.Victim);
    });

    it("Should store and reanimate with new module and registry", async () => {
        mockRegistry_(null);

        // Pre-flight sanity check. Victim derives from Living
        let v = new curMod.victim.Victim();
        should(isLiving(v)).be.True();

        registerObject(curMod.victim.Victim, "Victim", curMod.victim.module);

        const mummified = findMummy(curMod.victim.Victim);
        should(mummified).be.type("string");

        const parsed = JSON.parse(mummified);
        should(parsed).eql({
            name: "Victim",
            namespace: "",
            pkgName: "@adpt/core",
            pkgVersion: currentAdaptVersion,
            relFilePath: "../test/reanimate/test_victim.js",
        });

        // Clear out the registry and victim module
        mockRegistry_(null);
        deleteModule("victim");

        const obj = await reanimate(mummified);
        // This Victim will be a different object from the original
        should(obj).not.equal(curMod.victim.Victim);
        // But if we re-require the victim module, we'll get the updated obj
        requireModule("victim");
        should(obj).equal(curMod.victim.Victim);

        // And the reanimated object should still be an instance of Living
        v = new obj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("VictimInternal");
    });

    it("Should store and reanimate object registered before export", async () => {

        // Pre-flight sanity check. LateExport derives from Living
        let v = new curMod.lateExport.LateExport();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("LateExportInternal");

        // Clear everything
        deleteModule("lateExport");
        mockRegistry_(null);

        requireModule("lateExport");

        const firstMummyLate = findMummy(curMod.lateExport.LateExport);
        should(firstMummyLate).be.type("string");

        const parsed = JSON.parse(firstMummyLate);
        should(parsed).eql({
            // FIXME(mark): registerObject needs to delay searching module.exports
            // until after module.loaded === true. Then this should be:
            // name: "LateExport", namespace: ""
            name: "LateExportReg",
            namespace: "$adaptExports",
            pkgName: "@adpt/core",
            pkgVersion: currentAdaptVersion,
            relFilePath: "../test/reanimate/test_lateExport.js",
        });

        const mummyUrn = findMummyUrn(curMod.lateExport.LateExport);
        should(mummyUrn).equal(
            // tslint:disable-next-line:max-line-length
            `urn:Adapt:@adpt/core:${currentAdaptVersion}:$adaptExports:../test/reanimate/test_lateExport.js:LateExportReg`);

        const firstObj = await reanimate(firstMummyLate);
        // The reanimated object should still be an instance of Living
        v = new firstObj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("LateExportInternal");

        const firstObj2 = await reanimateUrn(mummyUrn);
        should(firstObj2).equal(firstObj);

        // Clear once more
        deleteModule("lateExport");
        mockRegistry_(null);

        const obj = await reanimate(firstMummyLate);
        // This LateExport will be a different object from the original
        should(obj).not.equal(firstObj);
        should(obj).not.equal(curMod.lateExport.LateExport);
        // But if we re-require the module, we'll get the updated obj
        requireModule("lateExport");
        should(obj).equal(curMod.lateExport.LateExport);

        // And the reanimated object should still be an instance of Living
        v = new obj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("LateExportInternal");
    });

    it("callerModule should return valid modules", () => {
        const files = [
            "dist/src/reanimate/reanimate.js",
            "dist/test/reanimate/reanimate.spec.js",
        ];

        for (let i = 0; i < files.length; i++) {
            const mod = callerModule(i);
            should(mod).be.type("object");
            should(mod.filename).equal(path.join(packageDirs.root, files[i]));
            if (i === 1) {
                should(mod).equal(module);
            }
        }
    });

    it("Should store and reanimate with module default", async () => {
        mockRegistry_(null);

        // modOrCallerNum is default paremeter
        curMod.inFunc.doRegister();

        const mummy = findMummy(curMod.inFunc.InFunc);
        should(mummy).be.type("string");

        const parsed = JSON.parse(mummy);
        should(parsed).eql({
            name: "InFunc",
            namespace: "",
            pkgName: "@adpt/core",
            pkgVersion: currentAdaptVersion,
            relFilePath: "../test/reanimate/test_inFunc.js",
        });

        // Clear out the registry and module
        mockRegistry_(null);
        deleteModule("inFunc");

        const obj = await reanimate(mummy);
        // This will be a different object from the original
        should(obj).not.equal(curMod.inFunc.InFunc);
        // But if we re-require the module, we'll get the updated obj
        requireModule("inFunc");
        should(obj).equal(curMod.inFunc.InFunc);

        // And the reanimated object should still be an instance of Living
        const v = new obj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("InFuncInternal");
    });
});

async function basicTestConstructor<M extends ModName, R extends ModCtorNames<M>>(
    modName: M,
    regName: R, // Name of the constructor we expect to be registered
    newName: R = regName, // Name of the constructor to new to cause registration
) {

    const getCtor = (name: R): any => curMod[modName][name];
    const regCtor = getCtor(regName);
    const newCtor = getCtor(newName);

    // Shouldn't have already registered
    should(() => findMummy(regCtor)).throwError(/Unable to look up JSON/);

    // Register on construct
    new newCtor();
    const mummyJson = findMummy(regCtor);

    should(mummyJson).be.type("string");

    const mummy = JSON.parse(mummyJson);
    should(mummy).eql({
        name: regName,
        namespace: "",
        pkgName: "@adpt/core",
        pkgVersion: currentAdaptVersion,
        relFilePath: `../test/reanimate/test_${modName}.js`,
    });

    let live = await reanimate(mummyJson);
    should(live).equal(regCtor);

    // Clear out the registry and module
    mockRegistry_(null);
    deleteModule(modName);

    live = await reanimate(mummyJson);
    // This will be a different object from the original
    should(live).not.equal(regCtor);
    // But if we re-require the module, we'll get the updated obj
    requireModule(modName);
    should(live).equal(getCtor(regName));

    const b = new live();
    should(b.constructor.name).equal(regName);
}

describe("registerConstructor", () => {

    it("Should store and reanimate constructor", async () => {
        await basicTestConstructor("baseReg", "BaseReg");
    });

    it("Should store and reanimate indirect register", async () => {
        await basicTestConstructor("baseReg", "BaseRegFunc");
    });

    it("Should store and reanimate nested constructor", async () => {
        await basicTestConstructor("baseReg", "BaseReg", "BaseRegNested");
    });
    it("Should store and reanimate derived class", async () => {
        await basicTestConstructor("baseReg", "Derived");
    });
});

const mainIndexJs = `
const re = require("@usys/reanimate");

try {
    if (process.argv.length !== 3) {
        throw new Error("Usage: node index.js <MummyJson>|show1|show2|showlate");
    }

    const mummy = process.argv[2];

    if (mummy === "show1") {
        const o = require("@usys/oldlib");
        console.log(re.findMummy(o.Victim));
        process.exit(0);
    }
    if (mummy === "show2") {
        const v = require("@usys/victim");
        console.log(re.findMummy(v.Victim));
        process.exit(0);
    }
    if (mummy === "showlate") {
        const v = require("@usys/register-in-func");
        // registerObject is only called on construction
        new v.LateVictim(true);
        console.log(re.findMummy(v.LateVictim));
        process.exit(0);
    }

    re.reanimate(mummy)
    .then((alive) => {
        new alive();
        console.log("SUCCESS");
    })
    .catch((err) => {
        console.log("FAILED\\n", err);
        process.exit(1);
    });

} catch (err) {
    console.log("FAILED\\n", err);
    process.exit(1);
}
`;
const mainPackage: Package = {
    pkgJson: {
        name: "@usys/test_proj",
        dependencies: {
            "@usys/reanimate": "1.0.0",
            "@usys/victim": "2.0.0",
            "@usys/oldlib": "1.0.0",
            "@usys/register-in-func": "1.0.0",
        }
    },
    files: {
        "index.js": mainIndexJs,
    },
};

function victimJs(version: string) {
    return `
const re = require("@usys/reanimate");

class Victim {
    constructor() {
        console.log("Created Victim version ${version}");
    }
}
exports.Victim = Victim;

re.registerObject(Victim, "Victim", module);
`;
}

function victimPackage(version: string): Package {
    return {
        pkgJson: {
            name: "@usys/victim",
            version,
            dependencies: {
                "@usys/reanimate": "1.0.0"
            }
        },
        files: {
            "index.js": victimJs(version)
        }
    };
}

const registerInFunc = `
const re = require("@usys/reanimate");

// registerObject NOT called from module scope

class LateVictimInternal {
    constructor(noPrint) {
        re.registerObject(LateVictimInternal, "Avictim", module);
        if (!noPrint) console.log("Created LateVictim");
    }
}
exports.LateVictim = LateVictimInternal;
`;

const registerInFuncPackage: Package = {
    pkgJson: {
        name: "@usys/register-in-func",
        dependencies: {
            "@usys/reanimate": "1.0.0"
        }
    },
    files: {
        "index.js": registerInFunc
    }
};

const distSrc = path.join(packageDirs.dist, "src");

const reanimatePackage: Package = {
    pkgJson: {
        name: "@usys/reanimate",
        dependencies: {
            "@adpt/utils": repoVersions.utils,
            "callsites": "2.0.0",
            "json-stable-stringify": "1.0.1",
            "read-pkg-up": "4.0.0",
            "ts-custom-error": "^2.2.1",
            "urn-lib": "1.1.2",
        },
    },
    files: {
        "index.js": "module.exports = require('./reanimate');\n",
    },
    copy: {
        "reanimate/index.js": path.join(distSrc, "reanimate", "reanimate.js"),
        "error.js": path.join(distSrc, "error.js"),
        "packageinfo.js": path.join(distSrc, "packageinfo.js"),
    }
};

const oldlibIndexJs = `
const v = require("@usys/victim");
exports.Victim = v.Victim;
`;

const oldlibPackage: Package = {
    pkgJson: {
        name: "@usys/oldlib",
        dependencies: {
            "@usys/victim": "1.0.0",
        },
    },
    files: {
        "index.js": oldlibIndexJs,
    }
};

async function createProject() {
    await writePackage(".", mainPackage);
    await writePackage("reanimate", reanimatePackage);
    await writePackage("oldlib", oldlibPackage);
    await writePackage("victim1", victimPackage("1.0.0"));
    await writePackage("victim2", victimPackage("2.0.0"));
    await writePackage("register-in-func", registerInFuncPackage);
}

async function showMummy(which: string): Promise<MummyJson> {
    // Get the mummy representation
    const res = await execa("node", ["index.js", "show" + which]);
    const mummyJson = res.stdout;
    should(mummyJson).not.match(/FAILED/);
    const mummy = JSON.parse(mummyJson);
    should(mummy).be.type("object");
    should(mummy.relFilePath).equal("index.js");

    return mummyJson;
}

function checkMummyVictim(which: string, mummyJson: MummyJson) {
    const mummy = JSON.parse(mummyJson);
    should(mummy).be.type("object");
    should(mummy.name).equal("Victim");
    should(mummy.pkgName).equal("@usys/victim");
    should(mummy.pkgVersion).equal(which + ".0.0");
}

describe("Reanimate in package tests", function () {
    let mummy1: string;
    let mummy2: string;

    this.timeout(10 * 1000);

    mochaTmpdir.all("adapt-reanimate-test");
    before(createProject);

    const localRegistry = mochaLocalRegistry.all({
        publishList: [
            repoDirs.utils,
            "reanimate",
            "oldlib",
            "victim1",
            "victim2",
            "register-in-func",
        ]
    });

    before(async function () {
        this.timeout(20 * 1000);
        await yarn.install(localRegistry.yarnProxyOpts);
    });

    it("Should reanimate top level dependency from mummy", async () => {
        const mummyJson = await showMummy("2");
        checkMummyVictim("2", mummyJson);
        mummy2 = mummyJson;

        // Reanimate the mummy and construct it
        const res = await execa("node", ["index.js", mummyJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created Victim version 2.0.0/);
    });

    it("Should reanimate sub dependency from mummy", async () => {
        const mummyJson = await showMummy("1");
        checkMummyVictim("1", mummyJson);
        mummy1 = mummyJson;

        // Reanimate the mummy object and construct it
        const res = await execa("node", ["index.js", mummyJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created Victim version 1.0.0/);
    });

    it("Should reanimate non-module-level registerObject", async () => {
        const mummyJson = await showMummy("late");
        const mummy = JSON.parse(mummyJson);
        should(mummy.name).equal("LateVictim");
        should(mummy.pkgName).equal("@usys/register-in-func");
        should(mummy.pkgVersion).equal("1.0.0");

        // Reanimate the mummy object and construct it
        const res = await execa("node", ["index.js", mummyJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created LateVictim/);
    });

    it("Should reanimate with different root dir", async () => {
        if (!mummy1 || !mummy2) {
            throw new Error(`Previous tests did not run successfully`);
        }

        const oldTmp = process.cwd();
        const newTmp = await fs.mkdtemp(path.join(os.tmpdir(), "adapt-reanimate"));

        // Make a new directory/project
        try {
            process.chdir(newTmp);
            await createProject();
            await yarn.install(localRegistry.yarnProxyOpts);

            let res = await execa("node", ["index.js", mummy1]);
            should(res.stdout).match(/SUCCESS/);
            should(res.stdout).match(/Created Victim version 1.0.0/);

            res = await execa("node", ["index.js", mummy2]);
            should(res.stdout).match(/SUCCESS/);
            should(res.stdout).match(/Created Victim version 2.0.0/);
        } finally {
            process.chdir(oldTmp);
            await fs.remove(newTmp);
        }
    });
});
