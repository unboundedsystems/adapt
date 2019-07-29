import { expect } from "chai";
import path from "path";
import { parse, SemVer } from "semver";
import { adaptVersionLabelPrefix, trySpecs, tryVersions } from "../../src/proj/new";

function mkVer(v: string): SemVer {
    const parsed = parse(v, true);
    if (!parsed) throw new Error(`Invalid semver ` + v);
    return parsed;
}

describe("Project new utils", () => {

    it("tryVersions should create list of versions to try", () => {
        expect(tryVersions(mkVer("1.0.0"))).eqls([
            "1.0.0",
            "1.0",
            "1",
        ].map((v) => adaptVersionLabelPrefix + v));

        expect(tryVersions(mkVer("3.4.5"))).eqls([
            "3.4.5",
            "3.4",
            "3",
        ].map((v) => adaptVersionLabelPrefix + v));
        expect(tryVersions(mkVer("001.000.00"))).eqls([
            "1.0.0",
            "1.0",
            "1",
        ].map((v) => adaptVersionLabelPrefix + v));
        expect(tryVersions(mkVer("0.1.1-next.2"))).eqls([
            "0.1.1-next.2",
            "0.1.1",
            "0.1",
            "0",
        ].map((v) => adaptVersionLabelPrefix + v));
    });

    it("trySpecs with valid npm name should include labeled gallery and npm URLs", () => {
        const specs = trySpecs("hello-node", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `hello-node@adapt-v1.0.0`,
            `hello-node@adapt-v1.0`,
            `hello-node@adapt-v1`,
            `hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `hello-node`,
            `hello-node`,
            `hello-node`,
            `hello-node`,
        ]);
    });

    it("trySpecs with valid npm name and version should not include gallery or labels", () => {
        const specs = trySpecs("hello-node@1.2.3", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `hello-node@1.2.3`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `hello-node@1.2.3`,
        ]);
    });

    it("trySpecs with leading dot should only include specified spec", () => {
        const spec = `.${path.sep}hello-node`;
        const specs = trySpecs(spec, mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: spec,
            base: spec,
            type: "local",
        }]);
    });

    it("trySpecs for absolute paths should only include specified spec", () => {
        const specs = trySpecs(path.sep + "hello-node", mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: path.sep + "hello-node",
            base: path.sep + "hello-node",
            type: "local",
        }]);
    });

    it("trySpecs for user homedir should only include specified spec", () => {
        const specs = trySpecs("~/hello-node", mkVer("1.0.0"));
        expect(specs).eqls([{
            complete: "~/hello-node",
            base: "~/hello-node",
            type: "local",
        }]);
    });

    it("trySpecs with git URL should include labels", () => {
        const specs = trySpecs(`git+https://gitlab.com/adpt/starters/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
            `git+https://gitlab.com/adpt/starters/hello-node`,
        ]);
    });

    it("trySpecs with git URL and committish should only include specified spec", () => {
        const specs = trySpecs(`git+https://gitlab.com/adpt/starters/hello-node#v1`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#v1`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/hello-node#v1`,
        ]);
    });

    it("trySpecs with gitlab shortcut should include labels", () => {
        const specs = trySpecs(`gitlab:adpt/starters/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `gitlab:adpt/starters/hello-node#adapt-v1.0.0`,
            `gitlab:adpt/starters/hello-node#adapt-v1.0`,
            `gitlab:adpt/starters/hello-node#adapt-v1`,
            `gitlab:adpt/starters/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
            `gitlab:adpt/starters/hello-node`,
        ]);
    });

    it("trySpecs with github extra shortcut should include labels", () => {
        const specs = trySpecs(`adpt/hello-node`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `adpt/hello-node#adapt-v1.0.0`,
            `adpt/hello-node#adapt-v1.0`,
            `adpt/hello-node#adapt-v1`,
            `adpt/hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `adpt/hello-node`,
            `adpt/hello-node`,
            `adpt/hello-node`,
            `adpt/hello-node`,
        ]);
    });

    it("trySpecs with gitlab shortcut and committish should only include specified spec", () => {
        const specs = trySpecs(`gitlab:adpt/starters/hello-node#v1`, mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `gitlab:adpt/starters/hello-node#v1`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `gitlab:adpt/starters/hello-node#v1`,
        ]);
    });

    it("trySpecs with invalid npm name should include gallery but no npm URLs", () => {
        const specs = trySpecs("_hello-node", mkVer("1.0.0"));
        expect(specs.map((s) => s.complete)).eqls([
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/_hello-node#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `_hello-node`,
        ]);
        expect(specs.map((s) => s.base)).eqls([
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `git+https://gitlab.com/adpt/starters/_hello-node`,
            `_hello-node`,
        ]);
    });
});
