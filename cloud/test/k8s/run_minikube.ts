import { k8sutils, minikube } from "@usys/testutils";
const { startTestMinikube, stopTestMinikube } = minikube;
const { deleteAll, getClient, getK8sConfig } = k8sutils;

export interface MinikubeInstance {
    kubeconfig?: object;
    client?: k8sutils.KubeClient;
}
export const mkInstance: MinikubeInstance = {};
let minikubeInfo: minikube.MinikubeInfo;

before(async function () {
    this.timeout(60 * 1000);
    minikubeInfo = await startTestMinikube();
    mkInstance.kubeconfig = minikubeInfo.kubeconfig;
    const clientConfig = getK8sConfig(mkInstance.kubeconfig);
    mkInstance.client = await getClient(clientConfig);
});

after(async function () {
    this.timeout(30 * 1000);
    if (minikubeInfo != null) {
        await stopTestMinikube(minikubeInfo);
    }
});

afterEach(async function () {
    this.timeout(20 * 1000);
    const client = mkInstance.client;
    if (client) {
        await deleteAll("pods", { client });
        await deleteAll("services", { client });
    }
});
