import Adapt, { childrenToArray, DomError, Group, isElement, PluginOptions } from "@usys/adapt";
import * as ld from "lodash";
import * as should from "should";

import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import * as util from "util";
import { Container, createPodPlugin, Pod, podElementToName, PodPlugin } from "../../src/k8s";

// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

describe("k8s Pod Component Tests", () => {
    it("Should Instantiate Pod", () => {
        const pod =
            <Pod key="test" config={{}}>
                <Container name="onlyContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
    });

    it("Should enforce unique container names", () => {
        const pod =
            <Pod key="test" config={{}}>
                <Container name="container" image="node:latest" />
                <Container name="dupContainer" image="node:latest" />
                <Container name="dupContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
        const { contents: dom } = Adapt.build(pod, null);
        if (dom == null) {
            should(dom).not.Null();
            return;
        }

        const kids = childrenToArray(dom.props.children);
        const err = ld.find(kids, (child) => {
            if (!isElement(child)) return false;
            if (child.componentType === DomError) return true;
            return false;
        });

        should(err).not.Undefined();
        if (!isElement(err)) {
            should(isElement(err)).True();
            return;
        }

        should(err.props.children).match(/dupContainer/);
    });

});

async function doBuild(elem: Adapt.AdaptElement) {
    const { messages, contents: dom } = await Adapt.build(elem, null);
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

xdescribe("k8s Pod Plugin Tests", function () {
    this.timeout(20000);

    let plugin: PodPlugin;
    let logs: WritableStreamBuffer;
    let options: PluginOptions;
    let k8sConfig: object;

    beforeEach(async () => {
        plugin = createPodPlugin();
        logs = new WritableStreamBuffer();
        options = {
            log: new Console(logs, logs).log
        };
        k8sConfig = k8s.config.fromKubeconfig("./kubeconfig");
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

    it("Should compute actions with no pods from k8s", async () => {
        const pod =
            <Pod key="test" config={k8sConfig}>
                <Container name="container" image="node:latest" />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        await plugin.observe(dom);
        const actions = await plugin.analyze(dom);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await plugin.finish();
    });

    async function createPod(name: string) {
        const pod =
            <Pod key={name} config={k8sConfig} terminationGracePeriodSeconds={0}>
                <Container name="container" image="alpine:3.8" command={["sleep", "3s"]} />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        await plugin.observe(dom);
        const actions = await plugin.analyze(dom);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await act(actions);

        const pods = await getPods(k8sConfig);
        should(pods.length).equal(1);
        should(pods[0].metadata.name).equal(podElementToName(dom));

        await plugin.finish();
    }

    it("Should create pod", async () => {
        await createPod("test");
    });

    xit("Should delete pod", async () => {
        await createPod("test");

        const dom = await doBuild(<Group />);
        await plugin.start(options);
        await plugin.observe(dom);
        const actions = await plugin.analyze(dom);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Deleting\s.+test/);

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
