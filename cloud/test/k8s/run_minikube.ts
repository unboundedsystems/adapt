import { k8sutils, minikube } from "@usys/testutils";
const { startTestMinikube, stopTestMinikube } = minikube;
const { deleteAllPods, getK8sConfig } = k8sutils;

export interface MinikubeInstance {
    kubeconfig?: object;
    k8sConfig?: object;
}
export const mkInstance: MinikubeInstance = {};
let minikubeInfo: minikube.MinikubeInfo;

before(async function () {
    this.timeout(60 * 1000);
    minikubeInfo = await startTestMinikube();
    mkInstance.kubeconfig = minikubeInfo.kubeconfig;
    mkInstance.k8sConfig = getK8sConfig(mkInstance.kubeconfig);
});

after(async function () {
    this.timeout(30 * 1000);
    if (minikubeInfo != null) {
        await stopTestMinikube(minikubeInfo);
    }
});

afterEach(async function () {
    this.timeout(20 * 1000);
    if (mkInstance.k8sConfig) await deleteAllPods(mkInstance.k8sConfig);
});
