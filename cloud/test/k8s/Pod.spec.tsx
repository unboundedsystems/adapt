import Adapt, {
    AdaptElementOrNull,
    childrenToArray,
    DomError,
    Group,
    isElement,
    PluginOptions,
    rule,
    Style,
} from "@usys/adapt";
import * as ld from "lodash";
import * as should from "should";

import { k8sutils } from "@usys/testutils";
import { sleep } from "@usys/utils";
import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import * as util from "util";
import * as abs from "../../src";
import {
    createK8sPlugin,
    K8sContainer,
    k8sContainerProps,
    K8sPlugin,
    Kind,
    Pod,
    resourceElementToName
} from "../../src/k8s";
import { canonicalConfigJSON } from "../../src/k8s/k8s_plugin";
import { mkInstance } from "./run_minikube";

const { getAll } = k8sutils;

describe("k8s Pod Component Tests", () => {
    it("Should Instantiate Pod", () => {
        const pod =
            <Pod key="test" config={{}}>
                <K8sContainer name="onlyContainer" image="node:latest" />
            </Pod>;

        should(pod).not.Undefined();
    });

    it("Should enforce unique container names", () => {
        const pod =
            <Pod key="test" config={{}}>
                <K8sContainer name="container" image="node:latest" />
                <K8sContainer name="dupContainer" image="node:latest" />
                <K8sContainer name="dupContainer" image="node:latest" />
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

    it("Should translate from abstract to k8s", () => {
        const absDom =
            <abs.Compute>
                <abs.Container name="one" dockerHost="" image="alpine" />
                <abs.Container name="two" dockerHost="" image="alpine" />
            </abs.Compute>;
        const style =
            <Style>
                {abs.Container} {rule<abs.ContainerProps>((props) => (
                    <K8sContainer {...k8sContainerProps(props)} />
                ))}
                {abs.Compute} {rule<abs.ComputeProps>((props) => (
                    <Pod config={{}}>
                        {props.children}
                    </Pod>
                ))}
            </Style>;
        const result = Adapt.build(absDom, style);
        const dom = result.contents;
        if (dom == null) {
            should(dom).not.be.Null();
            return;
        }
        should(result.messages).have.length(0);

        const domXml = Adapt.serializeDom(dom);
        const expected =
`<Adapt>
  <Resource kind="Pod">
    <__props__>
      <prop name="config">{}</prop>
      <prop name="key">"Compute-Pod"</prop>
      <prop name="metadata">{}</prop>
      <prop name="spec">{
  "containers": [
    {
      "env": [],
      "image": "alpine",
      "name": "one",
      "ports": [],
      "tty": false
    },
    {
      "env": [],
      "image": "alpine",
      "name": "two",
      "ports": [],
      "tty": false
    }
  ]
}</prop>
    </__props__>
  </Resource>
</Adapt>
`;
        should(domXml).eql(expected);
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

describe("k8s Pod Operation Tests", function () {
    this.timeout(4 * 60 * 1000);

    let plugin: K8sPlugin;
    let logs: WritableStreamBuffer;
    let options: PluginOptions;
    let kubeconfig: k8sutils.KubeConfig;
    let client: k8sutils.KubeClient;

    before(() => {
        if (mkInstance.kubeconfig == null ||
            mkInstance.client == null) throw new Error(`Minikube not running?`);
        kubeconfig = mkInstance.kubeconfig;
        client = mkInstance.client;
    });

    beforeEach(async () => {
        plugin = createK8sPlugin();
        logs = new WritableStreamBuffer();
        options = {
            log: new Console(logs, logs).log
        };
    });

    it("Should compute actions with no pods from k8s", async () => {
        const pod =
            <Pod key="test" config={kubeconfig}>
                <K8sContainer name="container" image="node:latest" />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await plugin.finish();
    });

    it("Should distinguish between replace and create actions", async () => {
        const pod =
            <Pod key="test" config={kubeconfig}>
                <K8sContainer name="container" image="node:latest" />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const mockObservation = {
            kind: Kind.pod,
            metadata: {
                name: resourceElementToName(dom),
                namespace: "default",
                labels: {},
                annotations: {}
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
        const pod =
            <Pod key={name} config={kubeconfig} terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={["sleep", "3s"]} />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await act(actions);

        const pods = await getAll("pods", { client });
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
        const pod =
            <Pod key="test" config={kubeconfig} terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={command} />
            </Pod>;

        const dom = await doBuild(pod);

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Replacing\s.+test/);

        await act(actions);

        const pods = await getAll("pods", { client });
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
        const pod =
            <Pod key="test" config={kubeconfig} terminationGracePeriodSeconds={0}>
                <K8sContainer name="container" image="alpine:3.8" command={command} />
            </Pod>;

        const dom = await doBuild(pod);

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
        const pods = await getAll("pods", { client });
        if (pods.length !== 0) {
            should(pods.length).equal(1);
            should(pods[0].metadata.deletionGracePeriod).not.Undefined();
        }

        await plugin.finish();
    });

});
