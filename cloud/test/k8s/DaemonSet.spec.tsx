/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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
    AdaptMountedElement,
    AdaptMountedPrimitiveElement,
    ChangeType,
    Group,
    PluginOptions,
    PrimitiveComponent,
    Waiting,
} from "@adpt/core";
import should from "should";

import { createMockLogger, k8sutils, MockLogger } from "@adpt/testutils";
import { sleep } from "@adpt/utils";
import {
    ActionPlugin,
    createActionPlugin
} from "../../src/action";
import {
    ClusterInfo,
    DaemonSet,
    daemonSetResourceInfo,
    K8sContainer,
    Kubeconfig,
    Pod,
    Resource,
    resourceElementToName,
} from "../../src/k8s";
import { labelKey } from "../../src/k8s/manifest_support";
import { mkInstance } from "../run_minikube";
import { act, checkNoActions, doBuild, randomName } from "../testlib";
import { forceK8sObserverSchemaLoad, K8sTestStatusType } from "./testlib";

const { deleteAll, getAll } = k8sutils;

// tslint:disable-next-line: no-object-literal-type-assertion
const dummyConfig = {} as ClusterInfo;
class DummyComponent extends PrimitiveComponent {}

describe("k8s DaemonSet Component Tests", () => {
    it("Should Instantiate and build DaemonSet", async () => {
        const ds =
            <DaemonSet key="test" config={dummyConfig}>
                <Pod config={dummyConfig}>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </DaemonSet>;

        should(ds).not.Undefined();

        const result = await Adapt.build(ds, null);
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
        const ds =
            <DaemonSet key="test" config={dummyConfig} selector={selector}>
                <Pod config={dummyConfig}>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </DaemonSet>;

        should(ds).not.Undefined();

        const result = await Adapt.build(ds, null);
        const dom = result.contents;
        if (dom == null) {
            throw should(dom).not.Null();
        }

        should(dom.componentType).equal(Resource);
        should(dom.props.spec.selector).eql(selector);
    });

    it("Should enforce single child Pod", async () => {
        const ds =
            <DaemonSet
                key="test"
                config={dummyConfig}
                selector={{ matchLabels: { test: "testDaemonSet" }}} >
                <Pod
                    config={dummyConfig}
                    metadata={{
                        labels: {
                            test: "testDaemonSet"
                        }
                    }}>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
                <Pod config={dummyConfig}>
                    <K8sContainer name="onlyContainer" image="node:latest" />
                </Pod>
            </DaemonSet>;

        const result = await Adapt.build(ds, null);
        should(result.messages).have.length(1);
        should(result.messages[0].content).match(/single Pod as a child/);
        should(result.messages[0].content).match(/found 2/);
    });

    it("Should enforce only Pod children", async () => {
        const ds =
            <DaemonSet
                key="test"
                config={dummyConfig}
                selector={{ matchLabels: { test: "testDaemonSet" }}} >
                <DummyComponent />
            </DaemonSet>;

        const result = await Adapt.build(ds, null);
        should(result.messages).have.length(1);
        should(result.messages[0].content).match(/not a Pod/);
    });

    it("Should require a Pod", async () => {
        const ds = <DaemonSet config={dummyConfig} selector={{}} />;
        const result = await Adapt.build(ds, null);
        should(result.messages).have.length(1);
        should(result.messages[0].content).match(/single Pod as a child/);
        should(result.messages[0].content).match(/found 0/);
    });
});

async function waitForDeployed(mountedOrig: AdaptMountedElement, dom: AdaptMountedElement, deployID: string) {
    let deployed: boolean | Waiting = false;
    do {
        const status = await mountedOrig.status<K8sTestStatusType>();
        should(status.kind).equal("DaemonSet");
        should(status.metadata.name).equal(resourceElementToName(dom, deployID));
        should(status.metadata.annotations).containEql({ [labelKey("name")]: dom.id });
        deployed = daemonSetResourceInfo.deployedWhen(status);
        if (deployed !== true) await sleep(1000);
        else return status;
    } while (1);
}

describe("k8s DaemonSet Operation Tests", function () {
    this.timeout(60 * 1000);

    let plugin: ActionPlugin;
    let logger: MockLogger;
    let options: PluginOptions;
    let kubeClusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let deployID: string | undefined;

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(20 * 1000);
        kubeClusterInfo = { kubeconfig: await mkInstance.kubeconfig as Kubeconfig };
        client = await mkInstance.client;
        forceK8sObserverSchemaLoad();
    });

    beforeEach(async () => {
        plugin = createActionPlugin();
        logger = createMockLogger();
        deployID = randomName("cloud-daemonset-op");
        options = {
            dataDir: "/fake/datadir",
            deployID,
            logger,
            log: logger.info,
        };
    });

    afterEach(async function () {
        this.timeout(40 * 1000);
        const apiPrefix = "apis/apps/v1";
        if (client) {
            await deleteAll("daemonsets", { client, deployID, apiPrefix });
        }
    });

    async function createDS(name: string): Promise<AdaptMountedPrimitiveElement | null> {
        const ds =
        <DaemonSet key={name} config={kubeClusterInfo}>
            <Pod
                config={kubeClusterInfo}
                terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={["sleep", "3s"]} />
            </Pod>
        </DaemonSet>;

        const { mountedOrig, dom } = await doBuild(ds, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.create);
        should(actions[0].detail).startWith("Creating DaemonSet");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.create);
        should(actions[0].changes[0].detail).startWith("Creating DaemonSet");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal(name);

        if (!deployID) throw new Error(`Missing deployID?`);

        await act(actions);

        const daemonsets = await getAll("daemonsets", { client, deployID, apiPrefix: "apis/apps/v1"});
        should(daemonsets).length(1);
        should(daemonsets[0].metadata.name).equal(resourceElementToName(dom, options.deployID));

        if (mountedOrig === null) throw should(mountedOrig).not.Null();

        const lastStatus = await waitForDeployed(mountedOrig, dom, deployID);

        const pods = await getAll("pods", { client, deployID });
        if (pods.length !== 1) {
            // tslint:disable-next-line: no-console
            console.error("Daemonset created, but no pods: ", JSON.stringify(lastStatus));
            should(pods).length(1);
        }
        should(pods[0].metadata.name)
            .startWith(resourceElementToName(dom, deployID));

        await plugin.finish();
        return dom;
    }

    it("Should create daemonset", async () => {
        await createDS("test");
    });

    it("Should modify daemonset", async () => {
        const oldDom = await createDS("test");

        //5s sleep diff to cause modify vs. 3s sleep in createPod
        const command = ["sleep", "5s"];
        const pod =
        <DaemonSet key="test" config={kubeClusterInfo}>
            <Pod
                config={kubeClusterInfo}
                terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={command} />
            </Pod>
        </DaemonSet>;

        const { mountedOrig, dom } = await doBuild(pod, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.modify);
        should(actions[0].detail).startWith("Updating DaemonSet");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.modify);
        should(actions[0].changes[0].detail).startWith("Updating DaemonSet");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        if (!deployID) throw new Error(`Missing deployID?`);

        await act(actions);

        if (mountedOrig == null) should(mountedOrig).not.Null();
        const lastStatus = await waitForDeployed(mountedOrig, dom, deployID);

        const pods = await getAll("pods", { client, deployID });
        if (pods.length !== 1) {
            // tslint:disable-next-line: no-console
            console.error("Daemonset modified, but no pods: ", JSON.stringify(lastStatus, undefined, 2));
            should(pods).length(1);
        }
        should(pods).length(1);
        should(pods[0].metadata.name)
            .startWith(resourceElementToName(dom, deployID));
        should(pods[0].spec.containers).length(1);
        should(pods[0].spec.containers[0].command).eql(command);

        await plugin.finish();
    });

    it("Should leave daemonset alone", async () => {
        const oldDom = await createDS("test");

        //No diff
        const command = ["sleep", "3s"];
        const pod =
        <DaemonSet key="test" config={kubeClusterInfo}>
            <Pod
                config={kubeClusterInfo}
                terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={command} />
            </Pod>
        </DaemonSet>;

        const { dom } = await doBuild(pod, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        checkNoActions(actions, dom);
        await plugin.finish();
    });

    it("Should delete daemonset", async () => {
        const oldDom = await createDS("test");

        const { dom } = await doBuild(<Group />, { deployID });
        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].type).equal(ChangeType.delete);
        should(actions[0].detail).startWith("Deleting DaemonSet");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.delete);
        should(actions[0].changes[0].detail).startWith("Deleting DaemonSet");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        if (!deployID) throw new Error(`Missing deployID?`);

        await act(actions);

        let pods: any[];
        do {
            await sleep(1000); //Give pods time to terminate
            pods = await getAll("pods", { client, deployID });
            if (pods.length !== 0) {
                should(pods.length).equal(1);
            }
        } while (pods.length !== 0);

        await plugin.finish();
    });

});
