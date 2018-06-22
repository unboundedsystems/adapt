import { expect, test } from "@oclif/test";

describe("Build command", () => {
    test
    .stdout()
    .command(["build", "somefile"])
    .it("runs build", (ctx) => {
        expect(ctx.stdout).to.contain("hello world");
    });

});
