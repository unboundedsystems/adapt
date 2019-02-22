import Adapt, {
    AdaptElementOrNull,
    childrenToArray,
    Group,
    handle,
    isMountedElement,
    PluginOptions,
    rule,
    Style,
} from "@usys/adapt";
import should from "should";

import { k8sutils } from "@usys/testutils";
import { sleep } from "@usys/utils";
import { Console } from "console";
import { WritableStreamBuffer } from "stream-buffers";
import * as abs from "../../src";
import {
    createK8sPlugin,
    K8sContainer,
    K8sPlugin,
    k8sServiceProps,
    Kubeconfig,
    Pod,
    Resource,
    resourceElementToName,
    Service,
    ServicePort,
} from "../../src/k8s";
import { canonicalConfigJSON } from "../../src/k8s/k8s_plugin";
import { mkInstance } from "../run_minikube";
import { act, doBuild, randomName } from "../testlib";
import { forceK8sObserverSchemaLoad, K8sTestStatusType } from "./testlib";

const { deleteAll, getAll } = k8sutils;
// tslint:disable-next-line:no-object-literal-type-assertion
const dummyConfig = {} as Kubeconfig;

describe("k8s Service Component Tests", () => {
    it("Should Instantiate Service", () => {
        const svc =
            <Service key="test" config={dummyConfig}></Service>;

        should(svc).not.Undefined();
    });

    it("Should refuse multiple ports if one has no name", async () => {
        const ports: ServicePort[] = [
            { name: "first", port: 9001, targetPort: 9001 },
            { port: 8001, targetPort: 81 },
        ];
        const svc =
            <Service key="test" ports={ports} config={dummyConfig} />;

        const { messages } = await Adapt.build(svc, null);
        should(messages).length(1);
        should(messages[0].content).match(/multiple ports/);
    });

    it("Should translate from abstract to k8s", async () => {
        const absDom =
            <abs.NetworkService port={8080} />;
        const style =
            <Style>
                {abs.NetworkService} {rule<abs.NetworkServiceProps>((props) => (
                    <Service {...k8sServiceProps(props)} config={dummyConfig} />
                ))}
            </Style>;
        const result = await Adapt.build(absDom, style);
        const dom = result.contents;
        if (dom == null) {
            should(dom).not.be.Null();
            return;
        }
        should(result.messages).have.length(0);

        const domXml = Adapt.serializeDom(dom);
        const expected =
            `<Adapt>
  <Resource kind="Service">
    <__props__>
      <prop name="config">{}</prop>
      <prop name="key">"NetworkService"</prop>
      <prop name="metadata">{}</prop>
      <prop name="spec">{
  "sessionAffinity": "None",
  "type": "ClusterIP",
  "ports": [
    {
      "port": 8080,
      "targetPort": 8080,
      "protocol": "TCP"
    }
  ]
}</prop>
    </__props__>
  </Resource>
</Adapt>
`;
        should(domXml).eql(expected);
    });

    it("Should resolve handle selectors", async () => {
        const hand = handle();
        const root = <Group>
            <Service config={dummyConfig} ports={[{ port: 8000, targetPort: 8080 }]} selector={hand} />
            <Pod handle={hand} config={{}}>
                <K8sContainer name="foo" image="alpine:3.1"></K8sContainer>
            </Pod>
        </Group>;
        const deployID = "foo";
        const { contents: dom, messages } = await Adapt.build(root, null, { deployID });
        should(messages).eql([]);
        if (dom === null) throw should(dom).not.Null();
        should(dom.props.children[0].props.spec.selector.adaptName)
            .equal(resourceElementToName(dom.props.children[1], deployID));

    });
});

describe("k8s Service Operation Tests", function () {
    this.timeout(10 * 1000);

    let plugin: K8sPlugin;
    let logs: WritableStreamBuffer;
    let options: PluginOptions;
    let kubeconfig: Kubeconfig;
    let client: k8sutils.KubeClient;
    let deployID: string | undefined;

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(20 * 1000);
        kubeconfig = await mkInstance.kubeconfig as Kubeconfig;
        client = await mkInstance.client;
        forceK8sObserverSchemaLoad();
    });

    beforeEach(async () => {
        plugin = createK8sPlugin();
        logs = new WritableStreamBuffer();
        deployID = randomName("cloud-service-op");
        options = {
            dataDir: "/fake/datadir",
            deployID,
            log: new Console(logs, logs).log
        };
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        if (client) {
            await deleteAll("pods", { client, deployID });
            await deleteAll("services", { client, deployID });
        }
    });

    it("Should compute actions with no services from k8s", async () => {
        const ports: ServicePort[] = [
            { name: "9001", port: 9001, targetPort: 9001 },
            { name: "8001", port: 8001, targetPort: 81 },
        ];
        const svc =
            <Service key="test" ports={ports} config={kubeconfig} />;

        const { dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await plugin.finish();
    });

    it("Should distinguish between replace and create actions", async () => {
        const ports: ServicePort[] = [
            { name: "9001", port: 9001, targetPort: 9001 },
            { name: "8001", port: 8001, targetPort: 81 },
        ];
        const svc =
            <Service key="test" ports={ports} config={kubeconfig} />;

        const { dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const mockObservation = {
            kind: "Service",
            metadata: {
                name: resourceElementToName(dom, options.deployID),
                namespace: "default",
            },
            spec: {
                ports,
                dataNotUnderstood: ["foo"] //Field that should be ignored
            },
            status: { phase: "" }
        };

        obs[canonicalConfigJSON(kubeconfig)].push(mockObservation);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Replacing\s.+test/);

        await plugin.finish();
    });

    it("Should use label for referencing pods as selectors", async () => {
        const hand = handle();
        const orig = <Group>
            <Service
                key="test"
                ports={[{ port: 8080, targetPort: 8080 }]}
                selector={hand}
                config={kubeconfig} />
            <Pod config={kubeconfig} handle={hand}>
                <K8sContainer name="foo" image="doesntmatter"></K8sContainer>
            </Pod>
        </Group>;
        const { dom } = await doBuild(orig, { deployID });
        const children = childrenToArray(dom.props.children);

        should(children.length).equal(2);
        const service = children[0];
        const pod = children[1];

        if (pod === undefined) throw should(service).not.Undefined();
        if (!isMountedElement(pod)) throw should(isMountedElement(pod)).True();
        should(pod.componentType).equal(Resource);
        should(pod.props.kind).equal("Pod");

        if (service === undefined) throw should(service).not.Undefined();
        if (!isMountedElement(service)) throw should(isMountedElement(service)).True();
        should(service.componentType).equal(Resource);
        should(service.props.kind).equal("Service");

        const serviceProps = service.props;
        should(serviceProps.spec).not.Undefined();
        should(serviceProps.spec.selector).eql({ adaptName: resourceElementToName(pod, options.deployID) });
    });

    it("Should return the resource name as the hostname", async () => {
        const svc = <Service key="test" config={kubeconfig} />;
        const { mountedOrig, dom } = await doBuild(svc, options);
        if (mountedOrig == null) throw should(mountedOrig).not.Null();
        const hostname = mountedOrig.instance.hostname();
        should(hostname).equal(resourceElementToName(dom, options.deployID));
    });

    async function createService(name: string): Promise<AdaptElementOrNull> {
        if (!deployID) throw new Error(`Missing deployID?`);
        const ports: ServicePort[] = [
            { port: 9001, targetPort: 9001 },
        ];
        const svc =
            <Service key={name} ports={ports} config={kubeconfig} />;

        const { mountedOrig, dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Creating\s.+test/);

        await act(actions);

        const svcs = await getAll("services", { client, deployID });
        should(svcs).length(1);
        should(svcs[0].metadata.name)
            .equal(resourceElementToName(dom, options.deployID));

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const status = await mountedOrig.status<K8sTestStatusType>();
        should(status.kind).equal("Service");
        should(status.metadata.name).equal(resourceElementToName(dom, options.deployID));
        should(status.metadata.annotations).containEql({ adaptName: dom.id });

        await plugin.finish();
        return dom;
    }

    it("Should create service", async () => {
        await createService("test");
    });

    it("Should replace service", async () => {
        if (!deployID) throw new Error(`Missing deployID?`);
        const oldDom = await createService("test");

        // Change one of the port numbers
        const newPorts: ServicePort[] = [
            { port: 9001, targetPort: 9002 },
        ];
        const svc =
            <Service key="test" ports={newPorts} config={kubeconfig} />;
        const { dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].description).match(/Replacing\s.+test/);

        await act(actions);

        const svcs = await getAll("services", { client, deployID });
        should(svcs).length(1);
        should(svcs[0].metadata.name)
            .equal(resourceElementToName(dom, options.deployID));
        should(svcs[0].spec.ports[0].targetPort).equal(9002);

        await plugin.finish();
    });

    it("Should leave service alone", async () => {
        const oldDom = await createService("test");

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, oldDom);
        const actions = plugin.analyze(oldDom, oldDom, obs);
        should(actions).length(0);
        await plugin.finish();
    });

    it("Should leave service alone (with handle)", async () => {
        function makeRoot() {
            const hand = handle();

            const ports: ServicePort[] = [
                { name: "foo", port: 9001, targetPort: 9001 },
                { name: "bar", port: 9002, targetPort: 9002 },
            ];

            return <Group>
                <Service key={"test"} type="LoadBalancer" ports={ports} config={kubeconfig} selector={hand} />
                <Pod handle={hand} config={kubeconfig}>
                    <K8sContainer name="foo" image="alpine:3.1" />
                </Pod>
            </Group>;
        }

        if (!deployID) throw new Error(`Missing deployID?`);

        const root = makeRoot();
        const { dom: oldDom } = await doBuild(root, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, oldDom);
        const actions = plugin.analyze(null, oldDom, obs);
        await act(actions);

        const svcs = await getAll("services", { client, deployID });
        should(svcs).length(1);
        should(svcs[0].metadata.name)
            .equal(resourceElementToName(oldDom.props.children[0], options.deployID));
        await plugin.finish();

        const root2 = makeRoot();
        const { dom } = await doBuild(root2, { deployID });

        await plugin.start(options);
        const obs2 = await plugin.observe(oldDom, dom);
        const actions2 = plugin.analyze(oldDom, dom, obs2);
        should(actions2).length(0);
        await plugin.finish();
    });

    it("Should delete service", async () => {
        if (!deployID) throw new Error(`Missing deployID?`);
        const oldDom = await createService("test");

        const { dom } = await doBuild(<Group />, { deployID });
        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Destroying\s.+adapt-resource-[0-9A-Fa-f]+/);

        await act(actions);

        await sleep(10);
        const svcs = await getAll("services", { client, deployID });
        should(svcs).have.length(0);

        await plugin.finish();
    });
});
