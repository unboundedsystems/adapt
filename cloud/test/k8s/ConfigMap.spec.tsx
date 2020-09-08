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
import should from "should";

import { k8sutils, mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import { mapValues } from "lodash";
import * as path from "path";
import { isBuffer } from "util";
import { createActionPlugin } from "../../src/action";
import {
    ClusterInfo,
    ConfigMap,
    Kubeconfig,
    Resource,
} from "../../src/k8s";
import { mkInstance } from "../run_minikube";
import { MockDeploy } from "../testlib";
import { forceK8sObserverSchemaLoad } from "./testlib";

const { deleteAll, getAll } = k8sutils;

// tslint:disable-next-line: no-object-literal-type-assertion
const dummyConfig = {} as ClusterInfo;

describe("k8s ConfigMap Component Tests", () => {
    it("Should Instantiate and build simple ConfigMap", async () => {
        const data = { foo: "foo", bar: "bar"};
        const cm =
            <ConfigMap
                key="test"
                config={dummyConfig}
                data={data}
            />;
        should(cm).not.Undefined();

        const result = await Adapt.build(cm, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.data).eql(data);
        should(dom.props.binaryData).eql({});
        should(dom.props.immutable).be.False();
    });

    it("Should respect string binary data", async () => {
        const data = { foo: Buffer.from("foo").toString("base64") };
        const cm =
            <ConfigMap
                key="test"
                config={dummyConfig}
                binaryData={data}
            />;
        should(cm).not.Undefined();

        const result = await Adapt.build(cm, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.data).eql({});
        should(dom.props.binaryData).eql(data);
    });

    it("Should convert buffer binary data", async () => {
        const data = { foo: Buffer.from("foo") };
        const cm =
            <ConfigMap
                key="test"
                config={dummyConfig}
                binaryData={data}
            />;
        should(cm).not.Undefined();

        const result = await Adapt.build(cm, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.data).eql({});
        should(dom.props.binaryData).eql(mapValues(data, (v) => v.toString("base64")));
    });
});

describe("k8s ConfigMap operation tests", function () {
    this.timeout(40 * 1000);

    const timeout = 30 * 1000;
    let clusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let pluginDir: string;
    let mockDeploy: MockDeploy;

    mochaTmpdir.all(`adapt-cloud-k8s-ConfigMap`);

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(10 * 1000);
        clusterInfo = { kubeconfig: await mkInstance.kubeconfig as Kubeconfig };
        client = await mkInstance.client;
        pluginDir = path.join(process.cwd(), "plugins");
        forceK8sObserverSchemaLoad();
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await mockDeploy.init();

    });

    afterEach(async function () {
        this.timeout(40 * 1000);
        if (client) {
            await Promise.all([
                deleteAll("configmaps", { client, deployID: mockDeploy.deployID }),
            ]);
        }
    });

    it("Should create simple config map", async () => {
        const data = { foo: "foo", bar: "bar" };
        const orig = <ConfigMap
            key="test"
            config={clusterInfo}
            data={data}
        />;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.enableTimeouts() ? timeout : undefined,
        });
        should(dom).not.Null();

        const maps = await getAll("configmaps", { client, deployID: mockDeploy.deployID });
        should(maps).length(1);
        const cm = maps[0];
        should(cm.data).eql(data);
        if (cm.immutable) {
            should(cm.immutable).be.False();
        }
    });

    it("Should round trip binary data", async () => {
        const data = { foo: Buffer.from("foo"), bar: Buffer.from("bar").toString("base64") };
        const orig = <ConfigMap
            key="test"
            config={clusterInfo}
            binaryData={data}
        />;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.enableTimeouts() ? timeout : undefined,
        });
        should(dom).not.Null();

        const maps = await getAll("configmaps", { client, deployID: mockDeploy.deployID });
        should(maps).length(1);
        const cm = maps[0];
        should(cm.binaryData).eql(mapValues(data, (v) => isBuffer(v) ? v.toString("base64") : v));
        if (cm.immutable) {
            should(cm.immutable).be.False();
        }
    });
});
