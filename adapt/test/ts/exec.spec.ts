import * as should from "should";
import * as tmpdir from "../mocha-tmpdir";

import * as path from "path";
import { npmInstall, pkgRootDir } from "../testlib";

import {
    chainHosts,
    exec,
    execString,
    FileSystemHost,
    HostImplEnd,
    MemoryHost
} from "../../src/ts";

const projDir = path.join(pkgRootDir, "test_projects");

describe("Exec basic tests", () => {
    it("Should execute a string", function() {
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
        const ret = execString(source);
        should(ret).be.type("string");
        should(ret).equal("5");
    });

    it("Should import a builtin module", function() {
        this.timeout(5000);

        const source = `
            import * as util from "util";
            util.inspect({test: 5});
        `;
        const ret = execString(source);
        should(ret).equal("{ test: 5 }");
    });

    it("Should modify context state", function() {
        this.timeout(5000);

        const source = `
            (global as any).foo.bar = 1;
        `;
        const context = { foo: {} };
        execString(source, context);
        should(context.foo).eql({bar: 1});
    });
});

describe("Exec module tests", function() {
    this.timeout(10000);
    const copyDir = path.resolve(projDir, "import_module");
    tmpdir.each("adapt-buildStack", {copy: copyDir});

    it("Should import a node module", function() {
        const rootDir = tmpdir.getTmpdir(this);
        npmInstall();
        const index = path.resolve(rootDir, "index.ts");
        const host = chainHosts(new HostImplEnd(),
                                new FileSystemHost("/", rootDir),
                                new MemoryHost("/", rootDir));
        const ret = exec(index, {host});
        should(ret).equal("test_camel");
    });
});
