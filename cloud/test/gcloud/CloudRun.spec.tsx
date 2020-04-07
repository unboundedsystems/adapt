/*
 * Copyright 2020 Unbounded Systems, LLC
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

import Adapt from "@adpt/core";
import { CloudRun, makeCloudRunName } from "../../src/gcloud";
import { describeGCloud } from "./support";

import * as fs from "fs-extra";
import * as path from "path";
import should from "should";
import { isArray } from "util";
import { createActionPlugin } from "../../src/action";
import { cloudRunDescribe, GCloudGlobalOpts } from "../../src/gcloud/commands";
import { MockDeploy, /*randomName*/ } from "../testlib";

describe("CloudRun component tests", () => {
    it("CloudRun component should build", async () => {
        await should(Adapt.build(
            <CloudRun
                image="alpine:latest"
                region="us-west1"
                port={8080}
            />, null)).not.rejected();
    });
});

async function getCloudRunInfo(
    name: string,
    region: string,
    globalOpts: GCloudGlobalOpts) {

    return cloudRunDescribe({
        name,
        region,
        env: {},
        args: [],
        image: "",
        port: 0,
        trafficPct: 100,
        cpu: 1,
        memory: "1Mi",
        allowUnauthenticated: false,
        globalOpts
    });
}

describeGCloud("CloudRun operation tests", function (gOpts) {
    this.timeout("2m");
    const region = "us-west1";
    let deploy: MockDeploy;

    beforeEach(async () => {
        const pluginDir = path.join(process.cwd(), "plugins");
        await fs.remove(pluginDir);
        deploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await deploy.init();
    });

    it("CloudRun component should deploy and delete with generated service name", async () => {
        const orig = <CloudRun
            key="cloud-run-gen-name"
            configuration={gOpts.configuration}
            region={region}
            image="gcr.io/adapt-ci/http-echo"
            port={5678}
            env={{ ADAPT_TEST_DEPLOY_ID: deploy.deployID } /* for cleanup */}
            args={["-text", "Adapt Test"]}
        />;

        const { dom, mountedOrig } = await deploy.deploy(orig);
        should(dom).not.Null();
        if (mountedOrig == null) throw should(mountedOrig).not.Null();

        const name = makeCloudRunName(mountedOrig.props.key,
            mountedOrig.id,
            deploy.deployID);

        const info = await getCloudRunInfo(name, region, gOpts);

        should(info).not.Undefined();
        should(info).not.Null();
        should(info).is.Object();

        const status: any = (info as any).status;
        should(status).not.Undefined();

        const conditions = status.conditions;
        if (conditions === undefined) should(conditions).not.Undefined();
        if (!isArray(conditions)) should(conditions).be.Array();

        const ready = conditions
            .find((cond: any) => (cond.status === "True" && cond.type === "Ready"));
        should(ready).not.Undefined();

        await deploy.deploy(null);
        const info2 = await getCloudRunInfo(name, region, gOpts);
        should(info2).Undefined();
    });

    it("CloudRun component should deploy with explicit service name");
    it("CloudRun component should be private by default");
    it("CloudRun component should allow unauthenticated access");
    it("CloudRun component should set cpu and memory settings");
    it("CloudRun component should set trafficPct parameter");
});
