import Adapt, { AdaptElementOrNull, Group, PluginOptions } from "@usys/adapt";
import * as should from "should";

import { minikube } from "@usys/testutils";
import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import * as util from "util";
import { createK8sPlugin, K8sPlugin, Kind, Resource, resourceElementToName } from "../../src/k8s";
import { canonicalConfigJSON } from "../../src/k8s/pod_plugin";

type MinikubeInfo = minikube.MinikubeInfo;
const { startTestMinikube, stopTestMinikube } = minikube;

// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

describe("k8s Resource Component Tests", () => {
    it("Should Instantiate Resource", () => {
        const resElem =
            <Resource key="test" kind={Kind.pod} config={{}} spec={{
                containers: [{
                    name: "test",
                    image: "dummy-image",
                }]
            }}>
            </Resource>;

        should(resElem).not.Undefined();
    });
});

async function doBuild(elem: Adapt.AdaptElement) {
    const { messages, contents: dom } = Adapt.build(elem, null);
    if (dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    should(messages.length).equal(0);
    return dom;
}

async function act(actions: Adapt.Action[]) {
    for (const action of actions) {
        try {
            await action.act();
        } catch (e) {
            throw new Error(`${action.description}: ${util.inspect(e)}`);
        }
    }
}

async function getClient(config: any) {
    const client = new k8s.Client({ config });
    await client.loadSpec();
    should(client.api).not.Null();
    should(client.api).not.Undefined();
    return client;
}

async function getPodsWithClient(client: any) {
    should(client.api).not.Null();
    should(client.api).not.Undefined();
    const pods = await client.api.v1.namespaces("default").pods.get();
    should(pods.statusCode).equal(200);
    return pods.body.items;
}

async function getPods(config: any) {
    const client = await getClient(config);
    return getPodsWithClient(client);
}

async function sleep(wait: number): Promise<void> {
    await new Promise((res) => {
        setTimeout(() => {
            res();
            return;
        }, wait);
        return;
    });
}

describe("k8s Plugin Tests (Resource, Kind.pod)", function () {
    this.timeout(4 * 60 * 1000);

    let plugin: K8sPlugin;
    let logs: WritableStreamBuffer;
    let options: PluginOptions;
    let kubeconfig: object;
    let k8sConfig: object;
    let minikubeInfo: MinikubeInfo;

    before(async () => {
        minikubeInfo = await startTestMinikube();
        kubeconfig = minikubeInfo.kubeconfig;
        k8sConfig = k8s.config.fromKubeconfig(kubeconfig);
    });

    after(async () => {
        if (minikubeInfo != null) {
            await stopTestMinikube(minikubeInfo);
        }
    });

    beforeEach(async () => {
        plugin = createK8sPlugin();
        logs = new WritableStreamBuffer();
        options = {
            log: new Console(logs, logs).log
        };
    });

    afterEach(async () => {
        const client = await getClient(k8sConfig);
        let pods = await getPodsWithClient(client);

        for (const pod of pods) {
            await client.api.v1.namespaces("default").pods(pod.metadata.name).delete();
        }

        const retries = 3;
        let count = 0;
        do {
            pods = await getPodsWithClient(client);
            await sleep(5000);
            count++;
        } while (pods.length !== 0 && count < retries);

        if (pods.length !== 0) {
            throw new Error(`Failed to remove pods: ${JSON.stringify(pods, null, 2)}`);
        }
    });

    it("Should compute actions with no resources from k8s", async () => {
        const resElem =
            <Resource key="test" config={kubeconfig} kind={Kind.pod} spec={{
                containers: [{
                    name: "container",
                    image: "alpine:latest"
                }]
            }}>
            </Resource >;

        const dom = await doBuild(resElem);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await plugin.finish();
    });

    it("Should distinguish between replace and create actions", async () => {
        const resElem =
            <Resource key="test" config={kubeconfig} kind={Kind.pod} spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8"
                }]
            }}>
            </Resource>;

        const dom = await doBuild(resElem);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const mockObservation = {
            kind: Kind.pod,
            metadata: {
                name: resourceElementToName(dom),
                namespace: "default",
                labels: []
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
        should(actions[0].description).match(/Replacing\s.+test/);

        await plugin.finish();
    });

    async function createPod(name: string): Promise<AdaptElementOrNull> {
        const resElem =
            <Resource key={name}
                config={kubeconfig}
                kind={Kind.pod}
                spec={{
                    containers: [{
                        name: "container",
                        image: "alpine:3.8",
                        command: ["sleep", "3s"],
                    }],
                    terminationGracePeriodSeconds: 0
                }}>
            </Resource>;

        const dom = await doBuild(resElem);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await act(actions);

        const pods = await getPods(k8sConfig);
        should(pods).length(1);
        should(pods[0].metadata.name).equal(resourceElementToName(dom));

        await plugin.finish();
        return dom;
    }

    it("Should create pod", async () => {
        await createPod("test");
    });

    it("Should replace pod", async () => {
        const oldDom = await createPod("test");

        //5s sleep diff to cause replace vs. 3s sleep in createPod
        const command = ["sleep", "5s"];
        const resElem = <Resource key="test"
            config={kubeconfig}
            kind={Kind.pod}
            spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8",
                    command,
                }],
                terminationGracePeriodSeconds: 0
            }}>
        </Resource>;

        const dom = await doBuild(resElem);

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Replacing\s.+test/);

        await act(actions);

        const pods = await getPods(k8sConfig);
        should(pods).length(1);
        should(pods[0].metadata.name).equal(resourceElementToName(dom));
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
            kind={Kind.pod}
            spec={{
                containers: [{
                    name: "container",
                    image: "alpine:3.8",
                    command,
                }],
                terminationGracePeriodSeconds: 0
            }}>
        </Resource>;

        const dom = await doBuild(resElem);

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(0);
        await plugin.finish();
    });

    it("Should delete pod", async () => {
        const oldDom = await createPod("test");

        const dom = await doBuild(<Group />);
        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Destroying\s.+fixme-manishv-[0-9A-Fa-f]+/);

        await act(actions);

        await sleep(6); // Sleep longer than termination grace period
        const pods = await getPods(k8sConfig);
        if (pods.length !== 0) {
            should(pods.length).equal(1);
            should(pods[0].metadata.deletionGracePeriod).not.Undefined();
        }

        await plugin.finish();
    });

});
