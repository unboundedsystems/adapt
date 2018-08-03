import {
    localRegistryDefaults,
    mochaLocalRegistry,
    mochaTmpdir,
    npm,
    repoDirs,
} from "@usys/utils";
import * as execa from "execa";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as should from "should";
import { packageDirs } from "../testlib";

import {
    callerModule,
    findFrozen,
    FrozenJson,
    mockRegistry_,
    reanimate,
    registerObject,
    ZombieRegistry
} from "../../src/reanimate/reanimate";
import * as firstInFunc from "./test_in_func";
import * as firstLateExport from "./test_late_export";
import { isLiving } from "./test_living";
import * as firstVictim from "./test_victim";

let currentVictim = firstVictim;
let currentLateExport = firstLateExport;
let currentInFunc = firstInFunc;

function deleteVictimModule() {
    delete require.cache[currentVictim.module.id];
}

function deleteLateExportModule() {
    delete require.cache[currentLateExport.module.id];
}

function deleteInFuncModule() {
    delete require.cache[currentInFunc.module.id];
}

function requireVictimModule() {
    currentVictim = require("./test_victim");
    // Ensure we actually got a new module
    should(currentVictim).not.equal(firstVictim);
}

function requireLateExportModule() {
    currentLateExport = require("./test_late_export");
    // Ensure we actually got a new module
    should(currentLateExport).not.equal(firstLateExport);
}

function requireInFuncModule() {
    currentInFunc = require("./test_in_func");
    should(currentInFunc).not.equal(firstInFunc);
}

describe("Reanimate basic tests", () => {
    let origRegistry: ZombieRegistry;
    let firstFrozen: FrozenJson;

    before(() => {
        origRegistry = mockRegistry_();
    });
    after(() => {
        mockRegistry_(origRegistry);
    });

    it("Should have registered on first import", async () => {
        mockRegistry_(origRegistry);

        firstFrozen = findFrozen(firstVictim.Victim);
        should(firstFrozen).be.type("string");

        const parsed = JSON.parse(firstFrozen);
        should(parsed).eql({
            name: "Victim",
            namespace: "",
            pkgName: "@usys/adapt",
            pkgVersion: "0.0.1",
            relFilePath: "../test/reanimate/test_victim.js",
        });

        const obj = await reanimate(firstFrozen);
        should(obj).equal(firstVictim.Victim);
    });

    it("Should freeze and reanimate with new module and registry", async () => {
        mockRegistry_(new ZombieRegistry());

        // Pre-flight sanity check. Victim derives from Living
        let v = new currentVictim.Victim();
        should(isLiving(v)).be.True();

        registerObject(currentVictim.Victim, "Victim", currentVictim.module);

        const frozenVictim = findFrozen(currentVictim.Victim);
        should(frozenVictim).be.type("string");

        const parsed = JSON.parse(frozenVictim);
        should(parsed).eql({
            name: "Victim",
            namespace: "",
            pkgName: "@usys/adapt",
            pkgVersion: "0.0.1",
            relFilePath: "../test/reanimate/test_victim.js",
        });

        // Clear out the registry and victim module
        mockRegistry_(new ZombieRegistry());
        deleteVictimModule();

        const obj = await reanimate(frozenVictim);
        // This Victim will be a different object from the original
        should(obj).not.equal(currentVictim.Victim);
        // But if we re-require the victim module, we'll get the updated obj
        requireVictimModule();
        should(obj).equal(currentVictim.Victim);

        // And the reanimated object should still be an instance of Living
        v = new obj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("VictimInternal");
    });

    it("Should freeze and reanimate object registered before export", async () => {

        // Pre-flight sanity check. LateExport derives from Living
        let v = new currentLateExport.LateExport();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("LateExportInternal");

        // Clear everything
        deleteLateExportModule();
        mockRegistry_(new ZombieRegistry());

        requireLateExportModule();

        const firstFrozenLate = findFrozen(currentLateExport.LateExport);
        should(firstFrozenLate).be.type("string");

        const parsed = JSON.parse(firstFrozenLate);
        should(parsed).eql({
            // FIXME(mark): registerObject needs to delay searching module.exports
            // until after module.loaded === true. Then this should be:
            // name: "LateExport", namespace: ""
            name: "LateExportReg",
            namespace: "$adaptExports",
            pkgName: "@usys/adapt",
            pkgVersion: "0.0.1",
            relFilePath: "../test/reanimate/test_late_export.js",
        });

        const firstObj = await reanimate(firstFrozenLate);
        // The reanimated object should still be an instance of Living
        v = new firstObj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("LateExportInternal");

        // Clear once more
        deleteLateExportModule();
        mockRegistry_(new ZombieRegistry());

        const obj = await reanimate(firstFrozenLate);
        // This LateExport will be a different object from the original
        should(obj).not.equal(firstObj);
        should(obj).not.equal(currentLateExport.LateExport);
        // But if we re-require the module, we'll get the updated obj
        requireLateExportModule();
        should(obj).equal(currentLateExport.LateExport);

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

    it("Should freeze and reanimate with module default", async () => {
        mockRegistry_(new ZombieRegistry());

        // modOrCallerNum is default paremeter
        currentInFunc.doRegister();

        const frozen = findFrozen(currentInFunc.InFunc);
        should(frozen).be.type("string");

        const parsed = JSON.parse(frozen);
        should(parsed).eql({
            name: "InFunc",
            namespace: "",
            pkgName: "@usys/adapt",
            pkgVersion: "0.0.1",
            relFilePath: "../test/reanimate/test_in_func.js",
        });

        // Clear out the registry and module
        mockRegistry_(new ZombieRegistry());
        deleteInFuncModule();

        const obj = await reanimate(frozen);
        // This will be a different object from the original
        should(obj).not.equal(currentInFunc.InFunc);
        // But if we re-require the module, we'll get the updated obj
        requireInFuncModule();
        should(obj).equal(currentInFunc.InFunc);

        // And the reanimated object should still be an instance of Living
        const v = new obj();
        should(isLiving(v)).be.True();
        should(v.constructor.name).equal("InFuncInternal");
    });

});

const templatePackageJson = {
    version: "1.0.0",
    license: "UNLICENSED",
    dependencies: {},
};

interface PkgJson {
    name: string;
    dependencies?: { [name: string]: string };
    [key: string]: string | object | undefined;
}

async function writePackageJson(dir: string, overrides: PkgJson) {
    const contents = { ...templatePackageJson, ...overrides };
    await fs.outputJson(path.join(dir, "package.json"), contents, { spaces: 2 });
}

interface Package {
    pkgJson: PkgJson;
    // value string is file contents
    files?: { [ filePath: string ]: string };
    // value string is a path to source file to copy
    copy?: { [ filePath: string ]: string };
}

async function writePackage(dir: string, pkg: Package) {
    await writePackageJson(dir, pkg.pkgJson);

    if (pkg.files) {
        for (const f of Object.keys(pkg.files)) {
            await fs.outputFile(path.join(dir, f), pkg.files[f]);
        }
    }
    if (pkg.copy) {
        for (const f of Object.keys(pkg.copy)) {
            await fs.copy(pkg.copy[f], path.join(dir, f));
        }
    }
}

const mainIndexJs = `
const re = require("@usys/reanimate");

try {
    if (process.argv.length !== 3) {
        throw new Error("Usage: node index.js <FrozenJson>|show1|show2|showlate");
    }

    const frozenJson = process.argv[2];

    if (frozenJson === "show1") {
        const o = require("@usys/oldlib");
        console.log(re.findFrozen(o.Victim));
        process.exit(0);
    }
    if (frozenJson === "show2") {
        const v = require("@usys/victim");
        console.log(re.findFrozen(v.Victim));
        process.exit(0);
    }
    if (frozenJson === "showlate") {
        const v = require("@usys/register-in-func");
        // registerObject is only called on construction
        new v.LateVictim(true);
        console.log(re.findFrozen(v.LateVictim));
        process.exit(0);
    }

    re.reanimate(frozenJson)
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
            "@usys/utils": "0.0.1",
            "callsites": "2.0.0",
            "json-stable-stringify": "1.0.1",
            "read-pkg-up": "4.0.0"
        },
    },
    files: {
        "index.js": "module.exports = require('./reanimate');\n",
    },
    copy: {
        "reanimate/index.js": path.join(distSrc, "reanimate", "reanimate.js"),
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

function setupRegistry() {
    return localRegistryDefaults.setupLocalRegistry([
        repoDirs.utils,
        "reanimate",
        "oldlib",
        "victim1",
        "victim2",
        "register-in-func",
    ].map((d) => path.resolve(d)));
}
const registryConfig = {
    ...localRegistryDefaults.config,
    onStart: setupRegistry,
};

async function showFrozen(which: string): Promise<FrozenJson> {
    // Get the frozen representation
    const res = await execa("node", ["index.js", "show" + which]);
    const frozenJson = res.stdout;
    should(frozenJson).not.match(/FAILED/);
    const parsed = JSON.parse(frozenJson);
    should(parsed).be.type("object");
    should(parsed.relFilePath).equal("index.js");

    return frozenJson;
}

function checkFrozenVictim(which: string, frozenJson: FrozenJson) {
    const parsed = JSON.parse(frozenJson);
    should(parsed).be.type("object");
    should(parsed.name).equal("Victim");
    should(parsed.pkgName).equal("@usys/victim");
    should(parsed.pkgVersion).equal(which + ".0.0");
}

describe("Reanimate in package tests", function() {
    let frozen1: string;
    let frozen2: string;

    this.timeout(40000);

    mochaTmpdir.all("adapt-reanimate-test");
    before(() => createProject());
    mochaLocalRegistry.all(registryConfig, localRegistryDefaults.configPath);
    before(() => npm.install(localRegistryDefaults.npmLocalProxyOpts));

    it("Should reanimate top level dependency from frozen", async () => {
        const frozenJson = await showFrozen("2");
        checkFrozenVictim("2", frozenJson);
        frozen2 = frozenJson;

        // Reanimate the frozen object and construct it
        const res = await execa("node", ["index.js", frozenJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created Victim version 2.0.0/);
    });

    it("Should reanimate sub dependency from frozen", async () => {
        const frozenJson = await showFrozen("1");
        checkFrozenVictim("1", frozenJson);
        frozen1 = frozenJson;

        // Reanimate the frozen object and construct it
        const res = await execa("node", ["index.js", frozenJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created Victim version 1.0.0/);
    });

    it("Should reanimate non-module-level registerObject", async () => {
        const frozenJson = await showFrozen("late");
        const parsed = JSON.parse(frozenJson);
        should(parsed.name).equal("LateVictim");
        should(parsed.pkgName).equal("@usys/register-in-func");
        should(parsed.pkgVersion).equal("1.0.0");

        // Reanimate the frozen object and construct it
        const res = await execa("node", ["index.js", frozenJson]);
        should(res.stdout).match(/SUCCESS/);
        should(res.stdout).match(/Created LateVictim/);
    });

    it("Should reanimate with different root dir", async () => {
        if (!frozen1 || !frozen2) {
            throw new Error(`Previous tests did not run successfully`);
        }

        const oldTmp = process.cwd();
        const newTmp = await fs.mkdtemp(path.join(os.tmpdir(), "adapt-reanimate"));

        // Make a new directory/project
        try {
            process.chdir(newTmp);
            await createProject();
            await npm.install(localRegistryDefaults.npmLocalProxyOpts);

            let res = await execa("node", ["index.js", frozen1]);
            should(res.stdout).match(/SUCCESS/);
            should(res.stdout).match(/Created Victim version 1.0.0/);

            res = await execa("node", ["index.js", frozen2]);
            should(res.stdout).match(/SUCCESS/);
            should(res.stdout).match(/Created Victim version 2.0.0/);
        } finally {
            process.chdir(oldTmp);
            await fs.remove(newTmp);
        }
    });
});
