/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import should from "should";

import Adapt, {
    Group,
    handle,
    Sequence,
    SFCBuildProps,
    SFCDeclProps,
    useAsync,
    useBuildHelpers,
    useDeployedWhen,
    useMethod,
    useMethodFrom,
    waiting
} from "@adpt/core";
import { k8sutils, minikubeMocha, mochaTmpdir } from "@adpt/testutils";
import { waitForNoThrow } from "@adpt/utils";
import fs from "fs-extra";
import path from "path";
import { OmitT, WithPartialT } from "type-ops";
import { createActionPlugin } from "../../src/action";
import { isExecaError } from "../../src/common";
import Container from "../../src/Container";
import { DockerContainer, DockerContainerProps, LocalDockerImage, LocalDockerRegistry } from "../../src/docker";
import { dockerRun, execDocker } from "../../src/docker/cli";
import { deleteAllContainers, deleteAllImages, deployIDFilter } from "../docker/common";
import { mkInstance } from "../run_minikube";
import { MockDeploy } from "../testlib";
import { forceK8sObserverSchemaLoad } from "./testlib";

import { ClusterInfo, Kubeconfig, ServiceDeployment } from "../../src/k8s";

const { deleteAll, getAll } = k8sutils;

async function killHupDockerd(fixture: minikubeMocha.MinikubeFixture) {
    const info = await fixture.info;
    const contId = info.container.id;
    await execDocker(["exec", contId, "killall", "-HUP", "dockerd"], { dockerHost: process.env.DOCKER_HOST });
}

async function revertDaemonJson(fixture: minikubeMocha.MinikubeFixture, oldDaemonJSON: string | null | undefined) {
    if (oldDaemonJSON === undefined) return;
    await installDaemonJSON(fixture, oldDaemonJSON);
}

async function installDaemonJSON(fixture: minikubeMocha.MinikubeFixture, daemonJSON: string | null) {
    const info = await fixture.info;
    const contId = info.container.id;
    let oldDaemonJSON: string | null = null;
    try {
        const result = await execDocker(["exec", contId, "cat", `/etc/docker/daemon.json`],
            { dockerHost: process.env.DOCKER_HOST });
        oldDaemonJSON = result.stdout;
    } catch (e) {
        if (isExecaError(e) && e.stderr && e.stderr.startsWith("cat: can't open '/etc/docker/daemon.json'")) {
            oldDaemonJSON = null;
        } else {
            throw e;
        }
    }

    if (daemonJSON === null) {
        await execDocker(["exec", contId, "rm", "/etc/docker/daemon.json"], { dockerHost: process.env.DOCKER_HOST });
        await killHupDockerd(fixture);
    } else {
        await fs.writeFile("daemon.json", daemonJSON);
        await execDocker(["cp", "daemon.json", `${contId}:/etc/docker/daemon.json`],
            { dockerHost: process.env.DOCKER_HOST });
        await killHupDockerd(fixture);
        await fs.remove("daemon.json");
    }

    return oldDaemonJSON;
}

const pending = Symbol("value-pending");
type Pending = typeof pending;

describe("k8s ServiceDeployment tests", function () {
    this.timeout(60 * 1000);

    let clusterInfo: ClusterInfo;
    let client: k8sutils.KubeClient;
    let pluginDir: string;
    let mockDeploy: MockDeploy;
    let oldDaemonJSON: string | null | undefined;

    mochaTmpdir.all(`adapt-cloud-k8s-ServiceDeployment`);

    before(async function () {
        this.timeout(mkInstance.setupTimeoutMs);
        this.slow(20 * 1000);
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
            const filter = deployIDFilter(mockDeploy.deployID);
            await Promise.all([
                deleteAll("deployments", { client, deployID: mockDeploy.deployID, apiPrefix: "apis/apps/v1" }),
                deleteAllContainers(filter),
            ]);
            await deleteAllImages(filter);
        }
        await revertDaemonJson(mkInstance, oldDaemonJSON);
    });

    it("should push container to private registry and run in k8s", async function () {
        const timeout = 300 * 1000;
        this.timeout(timeout);

        const dockerNetwork = (await mkInstance.info).network;
        const dockerNetworkId = dockerNetwork && dockerNetwork.id;

        interface LocalDindContainerProps
            extends OmitT<WithPartialT<DockerContainerProps, "dockerHost">, "image"> {
            daemonConfig: object | Pending;
        }

        function LocalDindContainer(propsIn: SFCDeclProps<LocalDindContainerProps>) {
            const { handle: hand, ...props } = propsIn as SFCBuildProps<LocalDindContainerProps>;

            const dindImg = handle();
            const dind = handle();

            const helpers = useBuildHelpers();
            const ipAddr = useMethod<string | undefined>(dind, undefined,
                "dockerIP", props.networks && props.networks[0]);

            useMethodFrom(dind, "dockerIP");

            const dockerHost = props.dockerHost;
            useDeployedWhen(async () => {
                let reason: string;
                if (props.daemonConfig && props.daemonConfig === pending) reason = `Waiting for daemonConfig`;
                else if (ipAddr) {
                    try {
                        await dockerRun({
                            autoRemove: true,
                            background: false,
                            image: "busybox:1",
                            dockerHost,
                            command: ["wget", "--spider", `http://${ipAddr}:2375/info`],
                        });
                        return true;
                    } catch (err) {
                        reason = err.message;
                    }
                } else {
                    reason = "No IP address for container";
                }
                return waiting(`Waiting for DIND to become ready (${reason})`);
            });

            if (props.daemonConfig && props.daemonConfig === pending) return null;

            const img = <LocalDockerImage handle={dindImg} dockerfile={`
                    FROM docker:dind
                    COPY --from=files /daemon.json /etc/docker/daemon.json
                `}
                files={[{
                    path: "/daemon.json",
                    contents: JSON.stringify(props.daemonConfig)
                }]}
                options={{
                    imageName: "adapt-test-service-deployment-dind",
                    uniqueTag: true
                }} />;

            const contProps = {
                ...props,
                handle: dind,
                image: dindImg,
                environment: { DOCKER_TLS_CERTDIR: "" },
                privileged: true,
                restartPolicy: { name: "Always" } as const,
            };

            const cont = <DockerContainer {...contProps} />;

            hand.replaceTarget(cont, helpers);

            return <Group>
                {img}
                {cont}
            </Group>;
        }

        let configInstalled = false;

        function TestBench() {
            const reg = handle();
            const testImg = handle();
            const dind = handle();

            const registryInternal = useMethod<string | undefined>(reg, undefined, "registry", dockerNetworkId);
            //const dindPorts = useMethod<number[] | undefined>(reg, undefined, "exposedPorts");
            const unusedRegistryPort = 23421;

            const daemonConfig = registryInternal === undefined ? pending : {
                "insecure-registries": [registryInternal]
            };

            useAsync(async () => {
                if (!configInstalled && registryInternal !== undefined) {
                    const oldConfig = await installDaemonJSON(mkInstance, JSON.stringify(daemonConfig));
                    configInstalled = true;
                    await fs.writeFile("oldDaemonJSON.json", JSON.stringify(oldConfig));
                }
            }, undefined);

            const networks = ["bridge"];
            if (dockerNetworkId) networks.push(dockerNetworkId);

            const dindIP = useMethod(dind, "dockerIP");
            return <Sequence>
                <LocalDockerRegistry handle={reg} port={unusedRegistryPort} networks={networks} />
                <LocalDindContainer handle={dind}
                    daemonConfig={daemonConfig}
                    networks={networks} />
                <LocalDockerImage handle={testImg} dockerfile={`
                    FROM alpine:3.8
                    CMD ["sleep", "3600"]
                `} options={{
                        dockerHost: `${dindIP}:2375`,
                        imageName: "adapt-test-service-deployment-testimg",
                        uniqueTag: true
                    }} />
                <ServiceDeployment podProps={{ terminationGracePeriodSeconds: 0 }} config={{
                    //FIXME(manishv) This is technically wrong,
                    //but I know earlier state loop turns will ensure registryInternal !== pending
                    //by the time we get here and need to deploy this component
                    registryUrl: registryInternal,
                    ...clusterInfo
                }}>
                    <Container name="foo" image={testImg} />
                </ServiceDeployment>
            </Sequence >;
        }

        const orig = <TestBench />;
        const { dom } = await mockDeploy.deploy(orig, {
            timeoutInMs: this.enableTimeouts() ? timeout : undefined,
        });
        oldDaemonJSON = JSON.parse((await fs.readFile("oldDaemonJSON.json")).toString());
        should(dom).not.Null();

        await waitForNoThrow(10, 1, async () => {
            const pods = await getAll("pods", { client, deployID: mockDeploy.deployID });
            should(pods).length(1);
            const pod = pods[0];
            should(pod).have.keys("status");
            const status = pod.status;
            should(status).have.keys("containerStatuses");
            const containerStatuses = status.containerStatuses;
            should(containerStatuses).length(1);
            should(containerStatuses[0]).have.key("state");
            should(containerStatuses[0].state).have.key("running");
        });
    });
});
