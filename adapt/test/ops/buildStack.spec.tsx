import * as fs from "fs";
import * as path from "path";
import * as should from "should";
import * as tmpdir from "../mocha-tmpdir";

import { npmInstall, pkgRootDir } from "../testlib";

import { PrimitiveComponent, UnbsPrimitiveElementImpl } from "../../src/jsx";
import { buildStack } from "../../src/ops/buildStack";

const simplePackageJson = {
    name: "test_project",
    version: "1.0.0",
    dependencies: {
        "source-map-support": "^0.5.5",
        "@types/node": "^8.10.14",
        "@usys/adapt": `file:${pkgRootDir}/../adapt`,
    }
};

const simpleIndexTsx = `
import unbs, { PrimitiveComponent } from "@usys/adapt";

class Simple extends PrimitiveComponent<{}> {}
unbs.stack("default", <Simple />);
`;

describe("buildStack Tests", function() {
    this.timeout(20000);
    tmpdir.each("adapt-buildStack");

    it("Should build a single file", () => {
        fs.writeFileSync("index.tsx", simpleIndexTsx);
        fs.writeFileSync("package.json",
                         JSON.stringify(simplePackageJson, null, 2));

        npmInstall();

        const out = buildStack("index.tsx", "default", {});

        if (out.dom == null) {
            should(out.dom).not.be.Null();
            return;
        }
        should(out.dom instanceof UnbsPrimitiveElementImpl).be.True();
        const el = out.dom as UnbsPrimitiveElementImpl<any>;
        should(el.componentInstance instanceof PrimitiveComponent).be.True();
        should(el.componentInstance!.constructor.name).equal("Simple");
    });
});

describe("buildStack Nodecellar example project", function() {
    this.timeout(20000);
    tmpdir.each("adapt-buildStack",
                {copy: path.join(pkgRootDir, "test_projects", "nodecellar")});

    it("Should build nodecellar demo", () => {

        const packages = [
            "file:" + pkgRootDir,
            "file:" + path.join(pkgRootDir, "..", "cloud")
        ];
        npmInstall();
        npmInstall({packages});

        const out = buildStack("index.tsx", "dev", {});

        if (out.dom == null) {
            should(out.dom).not.be.Null();
            return;
        }
        should(out.dom instanceof UnbsPrimitiveElementImpl).be.True();
        const el = out.dom as UnbsPrimitiveElementImpl<any>;
        should(el.componentInstance instanceof PrimitiveComponent).be.True();
    });
});
