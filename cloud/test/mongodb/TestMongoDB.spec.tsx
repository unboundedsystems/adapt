/*
 * Copyright 2019 Unbounded Systems, LLC
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

import Adapt, {
    AnyProps,
    handle,
    PrimitiveComponent,
    rule,
    Style,
} from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import path from "path";
import should from "should";
import {
    Container,
    NetworkScope,
    NetworkService,
    NetworkServiceInstance,
    Service
} from "../../src";
import { createActionPlugin } from "../../src/action";
import { TestMongoDB } from "../../src/mongodb";
import { deleteAllImages } from "../docker/common";
import { MockDeploy } from "../testlib";

class Final extends PrimitiveComponent<AnyProps> implements NetworkServiceInstance {
    static noPlugin = true;

    hostname(_scope: NetworkScope) { return "mongoHost"; }
    port() { return 1234; }
}

const mockStyle = <Style>
    {Service} {rule(({ handle: _h, ...props }) => <Final kind="Service" {...props} />)}
    {NetworkService} {rule(({ handle: _h, ...props }) => <Final kind="NetworkService" {...props} />)}
    {Container} {rule(({ handle: _h, ...props }) => <Final kind="Container" {...props}  />)}
</Style>;

describe("MongoDB", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(30 * 1000);
    this.slow(1 * 1000);

    mochaTmpdir.all("adapt-cloud-mongodb");

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
    });

    after(async function () {
        this.timeout(60 * 1000);
        await deleteAllImages(mockDeploy.deployID);
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true,
        });
        await mockDeploy.init();
    });

    it("Should build a connectToInstance with MONGODB_URI", async () => {
        const hand = handle();
        const orig = <TestMongoDB handle={hand} />;
        const { dom, mountedOrig } = await mockDeploy.deploy(orig, { style: mockStyle });
        if (dom == null) throw should(dom).be.ok();

        if (mountedOrig == null) throw should(mountedOrig).be.ok();
        const instance: TestMongoDB = mountedOrig.instance;
        if (instance == null) throw should(mountedOrig.instance).be.ok();
        const env = instance.connectEnv();
        should(env.MONGODB_URI).equal("mongodb://mongoHost:1234");
    });
});
