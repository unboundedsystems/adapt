import * as fs from "fs-extra";
import * as should from "should";
import * as tmpdir from "../mocha-tmpdir";

import { npmInstall, pkgRootDir } from "../testlib";

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
import Adapt, { PrimitiveComponent } from "@usys/adapt";

class Simple extends PrimitiveComponent<{}> {}
Adapt.stack("default", <Simple />);
`;

describe("buildStack Tests", function() {
    this.timeout(30000);
    tmpdir.each("adapt-buildStack");

    it("Should build a single file", async () => {
        await fs.writeFile("index.tsx", simpleIndexTsx);
        await fs.writeFile("package.json",
                           JSON.stringify(simplePackageJson, null, 2));

        npmInstall();

        const bs = buildStack("index.tsx", "default", "{}");

        should(bs.messages.length).equal(0);
        should(bs.domXml).equal(
`<Adapt>
  <Simple key="Simple"/>
</Adapt>
`);

        should(bs.stateJson).equal("{}");
    });
});

/*****
 * FIXME(mark): This is a system test and needs moved to cli in an
 * upcoming commit
 *
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
*/
