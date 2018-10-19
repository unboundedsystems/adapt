import Docker = require("dockerode");
import * as moment from "moment";
import graceful from "node-graceful";
import { addToNetwork, createNetwork, dockerPull } from "./dockerutils";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function setup(fixture: DockerFixtureImpl, beforeFn: FixtureFunc, afterFn: FixtureFunc) {

    beforeFn(async function startContainer(this: any) {
        this.timeout(4 * 60 * 1000);
        await fixture.start();
    });

    afterFn(async function stopContainer(this: any) {
        this.timeout(60 * 1000);
        await fixture.stop();
    });
}

export interface DockerFixture {
    dockerClient: Docker;
    container: Docker.Container;
}
export type ContainerSpec = Docker.ContainerCreateOptions;
export type ContainerSpecFunc = () => ContainerSpec;

export interface Options {
    addToNetworks?: string[];
}

const defaults: Required<Options> = {
    addToNetworks: [],
};

const specDefaults: ContainerSpec = {
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
};

type StopFunc = () => (void | Promise<void>);

class DockerFixtureImpl implements DockerFixture {
    dockerClient = new Docker({ socketPath: "/var/run/docker.sock" });
    container_?: Docker.Container;
    stops: StopFunc[] = [];
    options: Required<Options>;
    specFunc: ContainerSpecFunc;
    removeOnStop?: () => void;

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
        const containerSpec = this.specFunc();
        const image = containerSpec.Image;
        if (image == null) throw new Error(`Image must be specified in container spec`);

        const tempName = `test_${process.pid}_${moment().format("MMDD-HHmm-ss-SSSSSS")}`;

        const spec = { ...specDefaults, name: tempName, ...containerSpec };

        await dockerPull(this.dockerClient, image, "      ");
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
    }

    async stop() {
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
            this.removeOnStop = graceful.on("exit", () => this.stop(), true);
        }
        this.stops.push(fn);
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
