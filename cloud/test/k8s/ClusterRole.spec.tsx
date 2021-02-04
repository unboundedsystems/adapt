/*
 * Copyright 2021 Unbounded Systems, LLC
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
import * as path from "path";
import { createActionPlugin } from "../../src/action";
import {
    ClusterInfo,
    ClusterRole,
    Kubeconfig,
    Resource,
} from "../../src/k8s";
import { mkInstance } from "../run_minikube";
import { MockDeploy } from "../testlib";
import { forceK8sObserverSchemaLoad } from "./testlib";

const { deleteAll, getAll } = k8sutils;

// tslint:disable-next-line: no-object-literal-type-assertion
const dummyConfig = {} as ClusterInfo;

const rules = [
    {
        apiGroups: [""],
        resources: ["services", "endpoints", "pods"],
        verbs: ["get", "watch", "list"],
    },
    {
        apiGroups: ["extensions", "networking.k8s.io"],
        resources: ["ingresses"],
        verbs: ["get", "watch", "list"],
    },
    {
        apiGroups: [""],
        resources: ["nodes"],
        verbs: ["get", "watch", "list"],
    }
];

describe("k8s ClusterRole Component Tests", () => {
    it("Should Instantiate and build simple ClusterRole", async () => {
        const cr =
            <ClusterRole
                config={dummyConfig}
                key="test"
                rules={rules}
            />;
        should(cr).not.Undefined();

        const result = await Adapt.build(cr, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.kind).equal("ClusterRole");
        should(dom.props.rules).equal(rules);
    });
});

describe("k8s ClusterRole operation tests", function () {
    this.timeout(40 * 1000);

    const timeout = 30 * 1000;
    let clusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let pluginDir: string;
    let mockDeploy: MockDeploy;

    mochaTmpdir.all(`adapt-cloud-k8s-secret`);

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
                deleteAll("clusterroles", {
                    client,
                    deployID: mockDeploy.deployID,
                    namespaces: [ k8sutils.globalNS ],
                    apiPrefix: "apis/rbac.authorization.k8s.io/v1"
                }),
            ]);
        }
    });

    it("Should create simple ClusterRole", async () => {
        const orig = <ClusterRole
            config={clusterInfo}
            key="test"
            rules={rules}
        />;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.timeout() ? timeout : undefined,
        });
        should(dom).not.Null();

        const crs = await getAll("clusterroles", {
            client,
            deployID: mockDeploy.deployID,
            namespaces: [ k8sutils.globalNS ],
            apiPrefix: "apis/rbac.authorization.k8s.io/v1"
        });
        should(crs).length(1);
        const cr = crs[0];
        should(cr.rules).containDeep(rules);
    });
});
