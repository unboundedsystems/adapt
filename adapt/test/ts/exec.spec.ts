import { mochaTmpdir as tmpdir, npm } from "@usys/utils";
import * as should from "should";

import * as path from "path";
import { pkgRootDir } from "../testlib";

import { ProjectRunError } from "../../src/error";
import {
    exec,
    execString,
    MemFileHost,
} from "../../src/ts";

const projectsRoot = path.join(pkgRootDir, "test_projects");

describe("Exec basic tests", () => {
    it("Should execute a string", function () {
        this.timeout(5000);

        const source = `
            class Test<T> {
                constructor(public x: T) {}
                y() {
                    return this.x.toString();
                }
            }

            const mytest = new Test(5);
            mytest.y(); // final value returns to caller
        `;
        const { value } = execString(source);
        should(value).equal("5");
    });

    it("Should import a builtin module", function () {
        this.timeout(5000);

        const source = `
            import * as util from "util";
            util.inspect({test: 5});
        `;
        const { value } = execString(source);
        should(value).equal("{ test: 5 }");
    });

    it("Should modify context state", function () {
        this.timeout(5000);

        const source = `
            (global as any).foo.bar = 1;
        `;
        const context = { foo: {} };
        execString(source, context);
        should(context.foo).eql({bar: 1});
    });

    it("Should throw ProjectRunError upon error", function () {
        this.timeout(5000);

        const source =
            `// Comment line\n` +
            `throw new Error("This is my error");\n`;
        const shortStack =
            `[root].ts:2\n` +
            `throw new Error("This is my error");\n` +
            `^\n` +
            `\n` +
            `Error: This is my error\n` +
            `    at [root].ts:2:7`;

        const context = {};
        try {
            execString(source, context);
            throw new Error(`execString should have thrown`);
        } catch (err) {
            should(err).be.instanceof(ProjectRunError);
            should(err.message).equal("Error executing Adapt project: This is my error");
            should(err.projectStack).equal(shortStack);
            should(err.fullStack).startWith(shortStack);
            should(err.fullStack).match(/VmContext.run/);
        }
    });

});

describe("Exec module tests", function () {
    this.timeout(10000);
    const copyDir = path.resolve(projectsRoot, "import_module");
    tmpdir.each("adapt-exec", {copy: copyDir});

    it("Should require relative json file", () => {
        const projDir = process.cwd();
        const orig = {
            avalue: 1,
            another: "foo"
        };
        const host = MemFileHost("/", projDir);

        const source = `
            declare var require: any;
            const ctxObj = require("./stuff.json");
            ctxObj;
        `;

        host.writeFile("stuff.json", JSON.stringify(orig), false);
        host.writeFile("index.ts", source, false);

        const { value } = exec(path.join(projDir, "index.ts"), {host});
        should(value).eql(orig);
    });

    it("Should require absolute json file", () => {
        const projDir = process.cwd();
        const orig = {
            avalue: 1,
            another: "foo"
        };
        const host = MemFileHost("/", projDir);

        const source = `
            declare var require: any;
            const ctxObj = require("${projDir}/stuff.json");
            ctxObj;
        `;

        host.writeFile("stuff.json", JSON.stringify(orig), false);
        host.writeFile("index.ts", source, false);

        const { value } = exec(path.join(projDir, "index.ts"), {host});
        should(value).eql(orig);
    });

    it("Should import a node module", async () => {
        const projDir = process.cwd();
        await npm.install();
        const index = path.resolve(projDir, "index.ts");
        const host = MemFileHost("/", projDir);
        const { value } = exec(index, {host});
        should(value).equal("test_camel");
    });
});
