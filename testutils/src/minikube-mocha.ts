import { getClient, getK8sConfig, KubeClient } from "./k8sutils";
import {
    MinikubeInfo,
    startTestMinikube,
    stopTestMinikube,
} from "./minikube";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function setup(fixture: MinikubeFixtureImpl, beforeFn: FixtureFunc, afterFn: FixtureFunc) {

    beforeFn(async function startMinikube(this: any) {
        this.timeout(4 * 60 * 1000);

        fixture.info_ = await startTestMinikube();
    });

    afterFn(async function stopMinikube(this: any) {
        this.timeout(60 * 1000);
        const info = fixture.info_;
        if (info) {
            fixture.info_ = undefined;
            await stopTestMinikube(info);
        }
    });
}

export interface MinikubeFixture {
    info: MinikubeInfo;
    kubeconfig: MinikubeInfo["kubeconfig"];
    /**
     * MUST be awaited.
     */
    client: Promise<KubeClient>;
}

class MinikubeFixtureImpl implements MinikubeFixture {
    info_?: MinikubeInfo;

    get info(): MinikubeInfo {
        if (!this.info_) throw new Error(`Mocha minikube not initialized`);
        return this.info_;
    }

    get kubeconfig() {
        return this.info.kubeconfig;
    }

    /**
     * MUST be awaited. Returns promise.
     */
    get client(): Promise<KubeClient> {
        return getClient(getK8sConfig(this.kubeconfig));
    }
}

export function all(): MinikubeFixture {
    const fixture = new MinikubeFixtureImpl();
    setup(fixture, before, after);
    return fixture;
}
export function each(): MinikubeFixture {
    const fixture = new MinikubeFixtureImpl();
    setup(fixture, beforeEach, afterEach);
    return fixture;
}
