import Adapt, { childrenToArray, DomError, isElement, PluginOptions } from "@usys/adapt";
import * as k8s from "kubernetes-client";
import * as ld from "lodash";
import * as should from "should";

import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import { Container, createPodPlugin, Pod, PodPlugin } from "../../src/k8s";

describe("k8s Pod Component Tests", () => {
    it("Should Instantiate Pod", () => {
        const pod =
            <Pod name="test" config={{}}>
                <Container name="onlyContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
    });

    it("Should enforce unique container names", () => {
        const pod =
            <Pod name="test" config={{}}>
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

describe("k8s Pod Plugin Tests", () => {

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

    it("Should fetch pods from k8s", async () => {
        const pod =
            <Pod name="test" config={k8sConfig}>
                <Container name="container" image="node:latest" />
            </Pod>;

        await plugin.start(options);
        await plugin.observe(pod);
        await plugin.finish();
    });

});
