import should from "should";
import { run } from "../src/yarn/common";

describe("yarn run", function () {
    this.slow(500);

    it("should run command successfully", async () => {
        const retP = run("versions", {});

        // Check that retP is a ChildProcess
        should(retP.kill).be.a.Function();
        should(retP.pid).be.a.Number();

        const ret = await retP;

        // Check that ret is an ExecaReturns
        should(ret.cmd).be.a.String();
        should(ret.code).equal(0);
        should(ret.failed).equal(false);

        should(ret.stdout).match(/http_parser:/);
        should(ret.stdout).match(/node:/);
        should(ret.stdout).match(/v8:/);
    });

    it("should transform error on catch", async () => {
        const retP = run("foo", {});
        await retP.catch((err) => {
            should(err.message).startWith("yarn foo failed:");
        });
    });

    it("should transform error on then", async () => {
        const retP = run("foo2", {});
        await retP.then(
            (_val) => {
                throw new Error("Should not get here");
            },
            (err) => {
                should(err.message).startWith("yarn foo2 failed:");
            });
    });

    it("should transform error on await", async () => {
        try {
            await run("foo3", {});
            throw new Error("Should not get here");
        } catch (err) {
            should(err.message).startWith("yarn foo3 failed:");
        }
    });

});
