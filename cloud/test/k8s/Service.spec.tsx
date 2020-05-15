/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    callInstanceMethod,
    ChangeType,
    childrenToArray,
    Group,
    handle,
    isMountedElement,
    PluginOptions,
    rule,
    Style,
} from "@adpt/core";
import should from "should";

import { createMockLogger, k8sutils, mochaTmpdir, MockLogger } from "@adpt/testutils";
import { sleep } from "@adpt/utils";
import * as fs from "fs-extra";
import * as path from "path";
import * as abs from "../../src";
import { ActionPlugin, createActionPlugin } from "../../src/action";
import {
    ClusterInfo,
    K8sContainer,
    k8sServiceProps,
    Kubeconfig,
    Pod,
    Resource,
    resourceElementToName,
    Service,
    ServicePort,
} from "../../src/k8s";
import { mkInstance } from "../run_minikube";
import { act, checkNoActions, doBuild, MockDeploy, randomName } from "../testlib";
import { forceK8sObserverSchemaLoad, K8sTestStatusType } from "./testlib";

const { deleteAll, getAll } = k8sutils;
// tslint:disable-next-line:no-object-literal-type-assertion
const dummyConfig = {} as ClusterInfo;

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

    it("Should return first port if many configured", async () => {
        const svc = <Service
            key="test"
            config={dummyConfig} ports={[{ name: "foo", port: 80 }, { name: "bar", port: 1234 }]} />;
        const { mountedOrig } = await Adapt.build(svc, null);
        if (mountedOrig == null) throw should(mountedOrig).not.Null();
        const port = mountedOrig.instance.port();
        should(port).equal(80);
    });

    it("Should return a named port", async () => {
        const svc = <Service
            key="test"
            config={dummyConfig} ports={[{ name: "foo", port: 80 }, { name: "bar", port: 1234 }]} />;
        const { mountedOrig } = await Adapt.build(svc, null);
        if (mountedOrig == null) throw should(mountedOrig).not.Null();
        const port = mountedOrig.instance.port("bar");
        should(port).equal(1234);
    });

    it("Should return lone configured port", async () => {
        const svc = <Service key="test" config={dummyConfig} ports={[{ port: 80 }]} />;
        const { mountedOrig } = await Adapt.build(svc, null);
        if (mountedOrig == null) throw should(mountedOrig).not.Null();
        const port = mountedOrig.instance.port();
        should(port).equal(80);
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
            <Pod handle={hand} config={dummyConfig}>
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
    this.timeout(60 * 1000);

    let plugin: ActionPlugin;
    let logger: MockLogger;
    let options: PluginOptions;
    let clusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let deployID: string | undefined;
    let deploy: MockDeploy;

    mochaTmpdir.all(`adapt-cloud-k8s-Service`);

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(20 * 1000);
        clusterInfo = { kubeconfig: await mkInstance.kubeconfig as Kubeconfig };
        client = await mkInstance.client;
        forceK8sObserverSchemaLoad();
    });

    beforeEach(async () => {
        plugin = createActionPlugin();
        logger = createMockLogger();
        deployID = randomName("cloud-service-op");
        options = {
            dataDir: "/fake/datadir",
            deployID,
            logger,
            log: logger.info,
        };

        const pluginDir = path.join(process.cwd(), "plugins");
        await fs.remove(pluginDir);
        deploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await deploy.init();
    });

    afterEach(async function () {
        this.timeout(40 * 1000);
        if (client) {
            await Promise.all([
                deleteAll("pods", { client, deployID }),
                deleteAll("services", { client, deployID }),
                deleteAll("pods", { client, deployID: deploy.deployID }),
                deleteAll("services", { client, deployID: deploy.deployID }),
            ]);
        }
    });

    it("Should use label for referencing pods as selectors", async () => {
        const hand = handle();
        const orig = <Group>
            <Service
                key="test"
                ports={[{ port: 8080, targetPort: 8080 }]}
                selector={hand}
                config={clusterInfo} />
            <Pod config={clusterInfo} handle={hand}>
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
        const svc = <Service key="test" config={clusterInfo} />;
        const { mountedOrig, dom } = await doBuild(svc, options);
        if (mountedOrig == null) throw should(mountedOrig).not.Null();
        const hostname = mountedOrig.instance.hostname();
        should(hostname).equal(
            resourceElementToName(dom, options.deployID) + ".default.svc.cluster.local.");
    });

    it("Should return an external ingress IP as the LoadBalancer external hostname", async () => {
        const svc = <Service key="test" ports={[{ port: 8080}]} type="LoadBalancer" config={clusterInfo} />;
        const { dom, mountedOrig } = await deploy.deploy(svc);

        const svcs = await getAll("services", { client, deployID: deploy.deployID });
        should(svcs).length(1);
        if (dom === null) throw should(dom).not.Null();
        should(svcs[0].metadata.name).equal(resourceElementToName(dom, deploy.deployID));
        should(svcs[0].status).not.Undefined();
        should(svcs[0].status.loadBalancer).not.Undefined();
        should(svcs[0].status.loadBalancer.ingress).be.Array().of.length(1);
        const ingress = svcs[0].status.loadBalancer.ingress[0];
        const expectedIP = ingress.hostname || ingress.ip;

        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        const hostname = callInstanceMethod(mountedOrig.props.handle, undefined, "hostname", abs.NetworkScope.external);
        should(hostname).equal(expectedIP);
    });

    async function createService(name: string) {
        if (!deployID) throw new Error(`Missing deployID?`);
        const ports: ServicePort[] = [
            { port: 9001, targetPort: 9001 },
        ];
        const svc =
            <Service key={name} ports={ports} config={clusterInfo} />;

        const { mountedOrig, dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.create);
        should(actions[0].detail).startWith("Creating Service");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.create);
        should(actions[0].changes[0].detail).startWith("Creating Service");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal(name);

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

    it("Should modify service", async () => {
        if (!deployID) throw new Error(`Missing deployID?`);
        const oldDom = await createService("test");

        // Change one of the port numbers
        const newPorts: ServicePort[] = [
            { port: 9001, targetPort: 9002 },
        ];
        const svc =
            <Service key="test" ports={newPorts} config={clusterInfo} />;
        const { dom } = await doBuild(svc, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, dom);
        const actions = plugin.analyze(oldDom, dom, obs);
        should(actions).length(1);
        should(actions[0].type).equal(ChangeType.modify);
        should(actions[0].detail).startWith("Updating Service");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.modify);
        should(actions[0].changes[0].detail).startWith("Updating Service");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

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
        checkNoActions(actions, oldDom);
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
                <Service key={"test"} type="LoadBalancer" ports={ports} config={clusterInfo} selector={hand} />
                <Pod handle={hand} config={clusterInfo} terminationGracePeriodSeconds={0}>
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
        checkNoActions(actions2, dom.props.children);
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
        should(actions[0].type).equal(ChangeType.delete);
        should(actions[0].detail).startWith("Deleting Service");
        should(actions[0].changes).have.length(1);
        should(actions[0].changes[0].type).equal(ChangeType.delete);
        should(actions[0].changes[0].detail).startWith("Deleting Service");
        should(actions[0].changes[0].element.componentName).equal("Resource");
        should(actions[0].changes[0].element.props.key).equal("test");

        await act(actions);

        await sleep(10);
        const svcs = await getAll("services", { client, deployID });
        should(svcs).have.length(0);

        await plugin.finish();
    });
});
