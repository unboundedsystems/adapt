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

import Adapt, {
    PrimitiveComponent,
} from "@adpt/core";
import should from "should";

import { k8sutils, mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import * as path from "path";
import {
    createActionPlugin
} from "../../src/action";
import {
    ClusterInfo,
    Deployment,
    K8sContainer,
    Kubeconfig,
    Pod,
    Resource,
    resourceElementToName,
} from "../../src/k8s";
import { mkInstance } from "../run_minikube";
import { MockDeploy } from "../testlib";
import { forceK8sObserverSchemaLoad } from "./testlib";

const { getAll, deleteAll } = k8sutils;

// tslint:disable-next-line: no-object-literal-type-assertion
const dummyConfig = {} as ClusterInfo;
class DummyComponent extends PrimitiveComponent {}

describe("k8s Deployment Component Tests", () => {
    it("Should Instantiate and build Deployment", async () => {
        const dep =
            <Deployment key="test" config={dummyConfig}>
                <Pod isTemplate>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </Deployment>;

        should(dep).not.Undefined();

        const result = await Adapt.build(dep, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.spec.selector).not.Undefined();
        should(dom.props.spec.template).not.Undefined();
        should(dom.props.spec.template.metadata).not.Undefined();
        should(dom.props.spec.template.metadata.labels).not.Undefined();
    });

    it("Should respect user-set selector", async () => {
        const selector = { matchLabels: { foo: "bar" }};
        const dep =
            <Deployment key="test" config={dummyConfig} selector={selector}>
                <Pod isTemplate>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </Deployment>;

        should(dep).not.Undefined();

        const result = await Adapt.build(dep, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.spec.selector).eql(selector);
    });

    it("Should enforce single child Pod", async () => {
        const dep =
            <Deployment
                key="test"
                config={dummyConfig}
                selector={{ matchLabels: { test: "testDeployment" }}} >
                <Pod
                    isTemplate
                    metadata={{
                        labels: {
                            test: "testDeployment"
                        }
                    }}>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
                <Pod isTemplate>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </Deployment>;

        const result = await Adapt.build(dep, null);
        should(result.messages).have.length(1);
        should(result.messages[0].content).match(/single Pod as a child/);
        should(result.messages[0].content).match(/found 2/);
    });

    it("Should enforce only Pod children", async () => {
        const dep =
            <Deployment
                key="test"
                config={dummyConfig}
                selector={{ matchLabels: { test: "testDeployment" }}} >
                <DummyComponent />
            </Deployment>;

        const result = await Adapt.build(dep, null);
        should(result.messages).have.length(1);
        should(result.messages[0].content).match(/must be a Pod/);
    });
});

describe("k8s Deployment operation tests", function () {
    this.timeout(40 * 1000);

    const timeout = 30 * 1000;
    let clusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let pluginDir: string;
    let mockDeploy: MockDeploy;
    const apiPrefix = "apis/apps/v1";

    mochaTmpdir.all(`adapt-cloud-k8s-deployment`);

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
                deleteAll("deployments", { client, deployID: mockDeploy.deployID, apiPrefix }),
            ]);
        }
    });

    const createDeployment = async () => {
        const orig = <Deployment
            key="test"
            config={clusterInfo}
            replicas={1}
        >
            <Pod
                isTemplate
                terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={["sleep", "5m"]} />
            </Pod>
        </Deployment>;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.enableTimeouts() ? timeout : undefined,
        });
        if (dom == null) throw should(dom).not.Null();

        const deps = await getAll("deployments", { client, deployID: mockDeploy.deployID, apiPrefix });
        should(deps).length(1);

        const pods = await getAll("pods", { client, deployID: mockDeploy.deployID });
        should(pods).length(1);
        should(pods[0].metadata.name)
            .startWith(resourceElementToName(dom, mockDeploy.deployID));
    };

    it("Should create Deployment", async () => {
        await createDeployment();
    });

    it("Should modify Deployment", async () => {
        await createDeployment();

        const modified = <Deployment
            key="test"
            config={clusterInfo}
            replicas={1}
        >
            <Pod
                isTemplate
                terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={["sleep", "6m"]} />
            </Pod>
        </Deployment>;

        const { dom } = await mockDeploy.deploy(modified, {
            timeoutInMs: this.enableTimeouts() ? timeout : undefined,
        });
        if (dom == null) throw should(dom).not.Null();

        const deps = await getAll("deployments", { client, deployID: mockDeploy.deployID, apiPrefix });
        should(deps).length(1);

        const pods = await getAll("pods", { client, deployID: mockDeploy.deployID });
        await oneShouldNotThrow(pods, async (pod) => {
            should(pod.metadata.name)
                .startWith(resourceElementToName(dom, mockDeploy.deployID));
            // Make sure this is the updated pod
            should(pod.spec.containers[0].command).eql(["sleep", "6m"]);
        });
    });
});

async function oneShouldNotThrow<T>(items: T[], f: (item: T) => Promise<void>): Promise<void> {
    const errs: any[] = [];
    for (const item of items) {
        try {
            await f(item);
        } catch (e) {
            errs.push(e);
        }
    }
    if (items.length > errs.length) return;
    throw new Error(errs.map((e) => e.message).join("\n"));
}
