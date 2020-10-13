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

import { MaybePromise, onExit } from "@adpt/utils";
import Docker = require("dockerode");
import { merge } from "lodash";
import moment from "moment";
import pDefer from "p-defer";
import { addToNetwork, createNetwork, dockerPull, inContainer, proxyFromContainer } from "./dockerutils";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function setup(fixture: DockerFixtureImpl, beforeFn: FixtureFunc, afterFn: FixtureFunc) {

    if (!fixture.options.delayStart) {
        beforeFn(async function startContainer(this: any) {
            this.timeout(4 * 60 * 1000);
            await fixture.start();
        });
    }

    afterFn(async function stopContainer(this: any) {
        this.timeout(60 * 1000);
        await fixture.stop();
    });
}

export interface DockerFixture {
    dockerClient: Docker;
    container: Docker.Container;
    ports(localhost?: boolean): Promise<Ports>;
    start(): Promise<void>;
}
export type ContainerSpec = Docker.ContainerCreateOptions;
export type ContainerSpecFunc = () => ContainerSpec;

export interface Options {
    addToNetworks?: string[];
    delayStart?: boolean;
    finalSetup?: (fixture: DockerFixture) => MaybePromise<void>;
    /**
     * If no `Name` is specified in the `ContainerSpec`, a unique name is
     * generated for the container that begins with `namePrefix`.
     * @defaultValue `"test"`
     */
    namePrefix?: string;
    /**
     * When running from a container, set up TCP proxies on localhost that
     * match the localhost port bindings on the container. The result is that
     * connecting to this container is done via the exact same port on
     * localhost from both the parent host and from this container.
     * Additionally, the connection is always to `localhost`, which may have
     * special properties regarding security.
     *
     * This option must be used with a container configuration that binds
     * ports to localhost via either PortBindings or PublishAllPorts.
     * Only TCP ports are supported.
     */
    proxyPorts?: boolean;
    pullPolicy?: "always" | "never";
}

const defaults: Required<Options> = {
    addToNetworks: [],
    delayStart: false,
    finalSetup: () => {/* */},
    namePrefix: "test",
    proxyPorts: false,
    pullPolicy: "always",
};

export interface Ports {
    [portString: string]: string | undefined;
}

const specDefaults = (): ContainerSpec => ({
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    StdinOnce: false,
    HostConfig: {
        AutoRemove: true,
    },
    NetworkingConfig: {
        EndpointsConfig: {
        }
    },
    Env: [],
    Volumes: {},
});

type StopFunc = () => (void | Promise<void>);

class DockerFixtureImpl implements DockerFixture {
    dockerClient = new Docker();
    container_?: Docker.Container;
    stops: StopFunc[] = [];
    options: Required<Options>;
    specFunc: ContainerSpecFunc;
    removeOnStop?: () => void;
    pStarted?: pDefer.DeferredPromise<void>;
    ready = false;

    constructor(containerSpec: ContainerSpec | ContainerSpecFunc, options: Options = {}) {
        this.specFunc = (typeof containerSpec === "function") ?
            containerSpec : () => containerSpec;

        this.options = { ...defaults, ...options };
    }

    get container(): Docker.Container {
        if (!this.container_) throw new Error(`Docker container is not running`);
        return this.container_;
    }

    async start() {
        if (!this.pStarted) {
            this.pStarted = pDefer<void>();
            try {
                await this.start_();
                this.ready = true;
                this.pStarted.resolve();

            } catch (err) {
                this.pStarted.reject(err);
            }
        }
        return this.pStarted.promise;
    }

    async start_() {
        const containerSpec = this.specFunc();
        const image = containerSpec.Image;
        if (image == null) throw new Error(`Image must be specified in container spec`);

        const tempName = `${this.options.namePrefix}_${process.pid}_${moment().format("MMDD-HHmm-ss-SSSSSS")}`;

        const spec = merge(specDefaults(), { name: tempName }, containerSpec);

        if (this.options.pullPolicy !== "never") {
            await dockerPull(this.dockerClient, image, "      ");
        }
        const container = await this.dockerClient.createContainer(spec);

        let newNets = 0;
        for (let netName of this.options.addToNetworks) {
            let dnet: Docker.Network;

            if (netName === "NEW") {
                netName = `${tempName}_${newNets++}`;
                dnet = await this.createNetwork(netName);
            } else {
                dnet = this.dockerClient.getNetwork(netName);
            }
            await addToNetwork(container, dnet);
        }

        const pStart = container.start();
        this.onStop(() => container.stop());
        await pStart;
        this.container_ = container;
        if (this.options.proxyPorts) await this.setupProxies();
        await this.options.finalSetup(this);
    }

    async stop() {
        if (!this.pStarted) return; // We never tried to start
        if (!this.ready) {
            // We're still starting or failed. Let that finish.
            try {
                await this.pStarted.promise;
            } catch (err) {
                /* */
            }
        }

        if (this.removeOnStop) {
            this.removeOnStop();
            this.removeOnStop = undefined;
        }

        if (this.stops.length === 0) return;

        // Ensure that there's only one "thread" working on stopping
        const lStops = this.stops;
        this.stops = [];

        while (true) {
            const act = lStops.pop();
            if (!act) break;
            try {
                await act();
            } catch (err) {
                // tslint:disable-next-line:no-console
                console.log(`Ignoring error while trying to stop Docker container:`, err);
            }
        }
    }

    async createNetwork(netName: string) {
        const network = await createNetwork(this.dockerClient, netName);
        this.onStop(() => network.remove());
        if (network.id === undefined) throw new Error("Network id was undefined!");
        return network;
    }

    onStop(fn: StopFunc) {
        if (!this.removeOnStop) {
            this.removeOnStop = onExit(() => this.stop());
        }
        this.stops.push(fn);
    }

    async ports(localhost = false): Promise<Ports> {
        const info = await this.container.inspect();
        const p: Ports = {};

        if (localhost === true) {
            Object.entries(info.NetworkSettings.Ports).forEach(([portStr, hostArr]) => {
                p[portStr] = `localhost:${hostArr[0].HostPort}`;
            });
        } else {
            const hostname = info.NetworkSettings.IPAddress;
            Object.keys(info.Config.ExposedPorts).forEach((portStr) => {
                p[portStr] = `${hostname}:${parseInt(portStr, 10)}`;
            });
        }
        return p;
    }

    async setupProxies() {
        if (!inContainer()) return;

        const localPorts = await this.ports(true);
        if (Object.keys(localPorts).length === 0) {
            throw new Error(`No ports bound to localhost on container. Use PortBindings or PublishAllPorts`);
        }
        const targetPorts = await this.ports(false);

        for (const [portStr, local] of Object.entries(localPorts)) {
            if (!local) continue;
            if (!portStr.includes("/tcp")) continue; // Only tcp supported
            const m = local.match(/:(\d+)$/);
            if (!m || !m[1]) throw new Error(`Can't find local port number in '${portStr}`);
            const localPort = parseInt(m[1], 10);

            const target = targetPorts[portStr];
            if (!target) throw new Error(`No target port for '${portStr}'`);
            const stop = await proxyFromContainer(localPort, target);
            this.onStop(stop);
        }
    }
}

export function all(
    containerSpec: ContainerSpec | ContainerSpecFunc,
    options?: Options): DockerFixture {

    const fixture = new DockerFixtureImpl(containerSpec, options);
    setup(fixture, before, after);
    return fixture;
}

export function each(
    containerSpec: ContainerSpec | ContainerSpecFunc,
    options?: Options): DockerFixture {

    const fixture = new DockerFixtureImpl(containerSpec, options);
    setup(fixture, beforeEach, afterEach);
    return fixture;
}
