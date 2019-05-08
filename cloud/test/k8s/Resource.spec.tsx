import Adapt, {
    ChangeType,
    Group,
    isMountedElement,
    PluginOptions
} from "@usys/adapt";
import should from "should";

import { createMockLogger, k8sutils, MockLogger } from "@usys/testutils";
import { sleep } from "@usys/utils";
import {
    createK8sPlugin,
    K8sPlugin,
    Resource,
    resourceElementToName
} from "../../src/k8s";
import { canonicalConfigJSON } from "../../src/k8s/k8s_plugin";
import { mkInstance } from "../run_minikube";
import { act, checkNoChanges, doBuild, randomName } from "../testlib";
import { forceK8sObserverSchemaLoad, K8sTestStatusType } from "./testlib";

const { deleteAll, getAll } = k8sutils;

describe("k8s Resource Component Tests", () => {
    it("Should Instantiate Resource", () => {
        const resElem =
            <Resource key="test" kind="Pod" config={{}} spec={{
                containers: [{
                    name: "test",
                    image: "dummy-image",
                }]
            }}>
            </Resource>;

        should(resElem).not.Undefined();
    });
});

describe("k8s Plugin Tests (Resource, Pod)", function () {
    this.timeout(10 * 1000);

    let plugin: K8sPlugin;
    let logger: MockLogger;
    let options: PluginOptions;
    let kubeconfig: k8sutils.KubeConfig;
    let client: k8sutils.KubeClient;
    let deployID: string | undefined;

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(20 * 1000);
        kubeconfig = await mkInstance.kubeconfig;
        client = await mkInstance.client;
        forceK8sObserverSchemaLoad();
    });

    beforeEach(async () => {
        plugin = createK8sPlugin();
        logger = createMockLogger();
        deployID = randomName("cloud-k8s-plugin");
        options = {
            dataDir: "/fake/datadir",
            deployID,
            logger,
            log: logger.info,
        };
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        if (client) {
            await deleteAll("pods", { client, deployID });
            await deleteAll("services", { client, deployID });
        }
    });

    it("Should compute actions with no resources from k8s", async () => {
        const resElem =
            <Resource key="test" config={kubeconfig} kind="Pod" spec={{
                containers: [{
                    name: "container",
                    image: "alpine:latest"
                }]
            }}>
            </Resource >;

        const { dom } = await doBuild(resElem, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].type).equal(ChangeType.create);
        should(actions[0].detail).equal("Creating Pod");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.create);
        should(actions[0].changes[0].detail).equal("Creating Pod");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        await plugin.finish();
    });

    it("Should distinguish between replace and create actions", async () => {
        const resElem =
            <Resource key="test" config={kubeconfig} kind="Pod" spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8"
                }]
            }}>
            </Resource>;

        const { dom } = await doBuild(resElem, { deployID });
        if (!isMountedElement(dom)) {
            throw should(isMountedElement(dom)).True();
        }

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const mockObservation = {
            kind: "Pod",
            metadata: {
                name: resourceElementToName(dom, options.deployID),
                namespace: "default",
                labels: {},
                annotations: { adaptName: dom.id }
            },
            spec: {
                containers: [{
                    name: "container",
                    image: "alpine:latest", //This is the diff to cause a replace
                    dataNotUnderstood: ["foo"] //Field that should be ignored
                }],
            },
            status: { phase: "" }
        };

        obs[canonicalConfigJSON(kubeconfig)].push(mockObservation);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.replace);
        should(actions[0].detail).equal("Replacing Pod");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.replace);
        should(actions[0].changes[0].detail).equal("Replacing Pod");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        await plugin.finish();
    });

    async function createPod(name: string) {
        if (!deployID) throw new Error(`Missing deployID?`);
        const resElem =
            <Resource key={name}
                config={kubeconfig}
                kind="Pod"
                spec={{
                    containers: [{
                        name: "container",
                        image: "alpine:3.8",
                        command: ["sleep", "3s"],
                    }],
                    terminationGracePeriodSeconds: 0
                }}>
            </Resource>;

        const { mountedOrig, dom } = await doBuild(resElem, { deployID });
        if (!isMountedElement(dom)) {
            throw should(isMountedElement(dom)).True();
        }

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.create);
        should(actions[0].detail).equal("Creating Pod");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.create);
        should(actions[0].changes[0].detail).equal("Creating Pod");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal(name);

        await act(actions);

        const pods = await getAll("pods", { client, deployID });
        should(pods).length(1);
        should(pods[0].metadata.name)
            .equal(resourceElementToName(dom, options.deployID));
        should(pods[0].metadata.annotations).containEql({ adaptName: dom.id });

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const status = await mountedOrig.status<K8sTestStatusType>();
        should(status.kind).equal("Pod");
        should(status.metadata.name).equal(resourceElementToName(dom, options.deployID));
        should(status.metadata.annotations).containEql({ adaptName: dom.id });
        should(status.metadata.labels).eql({ adaptName: resourceElementToName(dom, options.deployID) });

        await plugin.finish();
        return dom;
    }

    it("Should create pod", async () => {
        await createPod("test");
    });

    it("Should replace pod", async () => {
        if (!deployID) throw new Error(`Missing deployID?`);
        const oldDom = await createPod("test");

        //5s sleep diff to cause replace vs. 3s sleep in createPod
        const command = ["sleep", "5s"];
        const resElem = <Resource key="test"
            config={kubeconfig}
            kind="Pod"
            spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8",
                    command,
                }],
                terminationGracePeriodSeconds: 0
            }}>
        </Resource>;

        const { dom } = await doBuild(resElem, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.replace);
        should(actions[0].detail).equal("Replacing Pod");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.replace);
        should(actions[0].changes[0].detail).equal("Replacing Pod");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        await act(actions);

        const pods = await getAll("pods", { client, deployID });
        should(pods).length(1);
        should(pods[0].metadata.name)
            .equal(resourceElementToName(dom, options.deployID));
        should(pods[0].spec.containers).length(1);
        should(pods[0].spec.containers[0].command).eql(command);

        await plugin.finish();
    });

    it("Should leave pod alone", async () => {
        const oldDom = await createPod("test");

        //No diff
        const command = ["sleep", "3s"];
        const resElem = <Resource key="test"
            config={kubeconfig}
            kind="Pod"
            spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8",
                    imagePullPolicy: "IfNotPresent",
                    command,
                }],
                terminationGracePeriodSeconds: 0
            }}>
        </Resource>;

        const { dom } = await doBuild(resElem, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        checkNoChanges(actions, dom);
        await plugin.finish();
    });

    it("Should delete pod", async () => {
        if (!deployID) throw new Error(`Missing deployID?`);
        const oldDom = await createPod("test");

        const { dom } = await doBuild(<Group />, { deployID });
        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].type).equal(ChangeType.delete);
        should(actions[0].detail).equal("Destroying removed Pod");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.delete);
        should(actions[0].changes[0].detail).equal("Destroying removed Pod");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        await act(actions);

        await sleep(6); // Sleep longer than termination grace period
        const pods = await getAll("pods", { client, deployID });
        if (pods.length !== 0) {
            should(pods.length).equal(1);
            should(pods[0].metadata.deletionGracePeriod).not.Undefined();
        }

        await plugin.finish();
    });

    it("Should not delete unmanaged pod", async () => {
        const manifest = {
            apiVersion: "v1",
            kind: "Pod",
            metadata: {
                name: randomName("unmanaged-pod")
            },
            spec: {
                containers: [{
                    name: "sleep",
                    image: "alpine:latest",
                    command: ["sleep", "5s"]
                }],
                terminationGracePeriodSeconds: 0
            }
        };

        const result = await client.api.v1.namespaces("default").pods.post({ body: manifest });
        should(result.statusCode).equal(201);

        const { dom } = await doBuild(<Group />, { deployID });
        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(0);
        await plugin.finish();

        await client.api.v1.namespaces("default").pods(manifest.metadata.name).delete();
    });

});
