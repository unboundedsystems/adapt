import pDefer from "p-defer";
import { getClient, getK8sConfig, KubeClient } from "./k8sutils";
import {
    MinikubeInfo,
    startTestMinikube,
    stopTestMinikube,
} from "./minikube";

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function setup(fixture: MinikubeFixtureImpl, _beforeFn: FixtureFunc, afterFn: FixtureFunc) {

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
    setupTimeoutMs: number;

    /**
     * All properties of this interface except those above MUST be awaited.
     */
    info: Promise<MinikubeInfo>;
    kubeconfig: Promise<MinikubeInfo["kubeconfig"]>;
    client: Promise<KubeClient>;
}

class MinikubeFixtureImpl implements MinikubeFixture {
    setupTimeoutMs = 4 * 60 * 1000;
    info_?: MinikubeInfo;
    private waiters: pDefer.DeferredPromise<MinikubeInfo>[] = [];

    /**
     * All getters MUST be awaited.
     */
    get info(): Promise<MinikubeInfo> {
        return this.getInfo();
    }
    get kubeconfig() {
        return this.getKubeconfig();
    }
    get client(): Promise<KubeClient> {
        return this.getClient();
    }

    private async getInfo() {
        if (this.info_) return this.info_;

        const deferred = pDefer<MinikubeInfo>();
        this.waiters.push(deferred);

        if (this.waiters.length === 1) {
            return startTestMinikube().then((mkinfo) => {
                this.info_ = mkinfo;
                while (true) {
                    const waiter = this.waiters.pop();
                    if (!waiter) break;
                    waiter.resolve(this.info_);
                }
                return this.info_;
            });
        }
        return deferred.promise;
    }

    private async getKubeconfig() {
        return (await this.info).kubeconfig;
    }

    private async getClient() {
        return getClient(getK8sConfig(await this.kubeconfig));
    }

    /**
     * MUST be awaited. Returns promise.
     */
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
