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

import Adapt, { Group, handle } from "@adpt/core";
import should from "should";

import { k8sutils, mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import * as path from "path";
import { createActionPlugin } from "../../src/action";
import {
    ClusterInfo,
    ClusterRole,
    ClusterRoleBinding,
    Kubeconfig,
    Resource,
    resourceElementToName,
    ServiceAccount,
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

describe("k8s ClusterRoleBinding Component Tests", () => {
    it("Should instantiate and build simple ClusterRoleBinding", async () => {
        const roleRef = { apiGroup: "", kind: "ClusterRole", name: "foo" };
        const subjects = [{ apiGroup: "", kind: "ServiceAccount", name: "bar"}];
        const crb =
            <ClusterRoleBinding
                config={dummyConfig}
                key="test"
                roleRef={roleRef}
                subjects={subjects}
            />;
        should(crb).not.Undefined();

        const result = await Adapt.build(crb, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.kind).equal("ClusterRoleBinding");
        should(dom.props.roleRef).eql(roleRef);
        should(dom.props.subjects).eql(subjects);
    });

    it("Should instantiate and build with handle roleRef", async () => {
        const subjects = [{ apiGroup: "", kind: "ServiceAccount", name: "bar"}];
        const deployID = "test";
        const crb = handle();
        const roleRef = handle();
        const orig = <Group>
            <ClusterRole
                handle={roleRef}
                config={dummyConfig}
                key="test1"
                rules={rules}
            />
            <ClusterRoleBinding
                handle={crb}
                config={dummyConfig}
                key="test2"
                roleRef={roleRef}
                subjects={subjects}
            />
        </Group>;
        should(orig).not.Undefined();

        const result = await Adapt.build(orig, null, { deployID });
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        if (crb.target === undefined) throw should(crb.target).not.Undefined();
        if (crb.target === null) throw should(crb.target).not.Null();
        if (roleRef.target === undefined) throw should(roleRef.target).not.Undefined();
        if (roleRef.target === null) throw should(roleRef.target).not.Null();
        should(crb.target.componentType).equal(Resource);
        should(crb.target.props.kind).equal("ClusterRoleBinding");
        should(crb.target.props.roleRef).eql({
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: resourceElementToName(roleRef.target, deployID)
        });
        should(crb.target.props.subjects).eql(subjects);
    });
    it("Should instantiate and build with handle subjects", async () => {
        const roleRef = { apiGroup: "", kind: "ClusterRole", name: "foo" };
        const deployID = "test";
        const crb = handle();
        const sa = handle();
        const orig = <Group>
            <ServiceAccount
                handle={sa}
                config={dummyConfig}
                key="test1"
            />
            <ClusterRoleBinding
                handle={crb}
                config={dummyConfig}
                key="test2"
                roleRef={roleRef}
                subjects={[sa]}
            />
        </Group>;
        should(orig).not.Undefined();

        const result = await Adapt.build(orig, null, { deployID });
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        if (crb.target === undefined) throw should(crb.target).not.Undefined();
        if (crb.target === null) throw should(crb.target).not.Null();
        if (sa.target === undefined) throw should(sa.target).not.Undefined();
        if (sa.target === null) throw should(sa.target).not.Null();
        should(crb.target.componentType).equal(Resource);
        should(crb.target.props.kind).equal("ClusterRoleBinding");
        should(crb.target.props.roleRef).eql(roleRef);
        should(crb.target.props.subjects).eql([{
            apiGroup: "",
            kind: "ServiceAccount",
            name: resourceElementToName(sa.target, deployID),
            namespace: "default",
        }]);
    });
});

describe("k8s ClusterRoleBinding operation tests", function () {
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
                deleteAll("clusterrolebindings", {
                    client,
                    deployID: mockDeploy.deployID,
                    namespaces: [ k8sutils.globalNS ],
                    apiPrefix: "apis/rbac.authorization.k8s.io/v1"
                }),
                deleteAll("clusterroles", {
                    client,
                    deployID: mockDeploy.deployID,
                    namespaces: [ k8sutils.globalNS ],
                    apiPrefix: "apis/rbac.authorization.k8s.io/v1"
                }),
                deleteAll("serviceaccounts", {
                    client,
                    deployID: mockDeploy.deployID,
                    namespaces: [ k8sutils.globalNS ],
                }),
            ]);
        }
    });

    it("Should create handle-based ClusterRoleBinding", async () => {
        const cr = handle();
        const sa = handle();
        const orig = <Group>
            <ClusterRole
                handle={cr}
                config={clusterInfo}
                key="cr"
                rules={rules}
            />
            <ServiceAccount handle={sa} config={clusterInfo} key="sa" />
            <ClusterRoleBinding
                config={clusterInfo}
                key="crb"
                roleRef={cr}
                subjects={[sa]}
            />
        </Group>;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.timeout() ? timeout : undefined,
        });
        should(dom).not.Null();

        const crbs = await getAll("clusterrolebindings", {
            client,
            deployID: mockDeploy.deployID,
            namespaces: [ k8sutils.globalNS ],
            apiPrefix: "apis/rbac.authorization.k8s.io/v1"
        });
        should(crbs).length(1);
        const actualCRB = crbs[0];

        if (cr.target === null) throw should(cr.target).not.Null();
        if (cr.target === undefined) throw should(cr.target).not.Undefined();
        should(actualCRB.roleRef).eql({
            apiGroup: cr.target.props.apiVersion.split("/")[0],
            kind: cr.target.props.kind,
            name: resourceElementToName(cr.target, mockDeploy.deployID)
        });

        if (sa.target === null) throw should(sa.target).not.Null();
        if (sa.target === undefined) throw should(sa.target).not.Undefined();
        should(actualCRB.subjects).containDeep([{
            kind: sa.target.props.kind,
            name: resourceElementToName(sa.target, mockDeploy.deployID)
        }]);
    });
});
