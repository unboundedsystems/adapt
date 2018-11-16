import { ExecutedQuery, gql, ObserverResponse } from "@usys/adapt";
import { execute } from "graphql";
import * as ld from "lodash";
import should from "should";
import { K8sObserver } from "../../src/k8s/k8s_observer";
import { mkInstance } from "../run_minikube";

interface PodType {
    metadata?: {
        name?: string;
    };
}
function checkPods(items?: (PodType | undefined)[]) {
    if (items === undefined) return should(items).not.Undefined();
    if (!ld.isArray(items)) return should(items).Array();

    for (const item of items) {
        if (item === undefined) return should(item).not.Undefined();
        const meta = item.metadata;
        if (meta === undefined) return should(meta).not.Undefined();
        const name = meta.name;
        if (name === undefined) return should(name).not.Undefined();
        const re = /(^(?:kube-dns)|(?:kube-addon-manager)|(?:storage-provisioner))-[a-z\-0-9]+$/;
        return should(name).match(re);
    }
    should(items.length).equal(3);
}

function checkObservations(observations: ObserverResponse) {
    should(observations).not.Undefined();
    should(observations).not.Null();

    const context = observations.context;
    should(context).not.Undefined();
    should(Object.keys(context)).length(1);
    const pods = context[Object.keys(context)[0]];
    should(pods).not.Undefined();
    should(pods.kind).equal("PodList");
    should(pods.apiVersion).equal("v1");
    should(pods.metadata).not.Undefined();

    checkPods(pods.items);
}

describe("k8s observer tests", () => {
    let observer: K8sObserver;
    let queries: ExecutedQuery[];

    before("Construct schema", function () {
        this.timeout(40 * 1000);
        this.slow(17 * 1000);
        observer = new K8sObserver();
        observer.schema; //Force slow construction of schema once for whole suite
    });

    before(() => {
        queries = [
            {
                query: gql`query ($kubeconfig: JSON!) {
                    withKubeconfig(kubeconfig: $kubeconfig) {
                        listCoreV1NamespacedPod(namespace: "kube-system") {
                            kind
                            items { metadata { name } }
                        }
                    }
                }`,
                variables: { kubeconfig: mkInstance.kubeconfig }
            },
            {
                query: gql`query ($kubeconfig: JSON!) {
                    withKubeconfig(kubeconfig: $kubeconfig) {
                        listCoreV1NamespacedPod(namespace: "kube-system") {
                            kind,
                            apiVersion,
                            items { metadata { name } }
                        }
                    }
                }`,
                variables: { kubeconfig: mkInstance.kubeconfig }
            }
        ];
    });

    beforeEach("Instantiate observer", function () {
        this.slow(500);
        this.timeout(2 * 1000);
        observer = new K8sObserver();
    });

    it("should observe running system pods", async function () {
        this.slow(500);
        this.timeout(5000);

        const observations = await observer.observe(queries);
        checkObservations(observations);
    });

    it("should query running system pods", async function () {
        this.slow(500);
        this.timeout(5000);

        const schema = observer.schema;
        let result = await execute(
            schema,
            queries[0].query,
            undefined,
            undefined,
            queries[0].variables);
        if (result.errors === undefined) return should(result.errors).not.Undefined();
        should(result.errors).length(1);
        should(result.errors[0]!.message).match(/Adapt Observer Needs Data/);

        const observations = await observer.observe(queries);
        checkObservations(observations); //Tested above but makes debuggin easier

        result = await execute(
            schema,
            queries[0].query,
            observations.data,
            observations.context,
            queries[0].variables);
        should(result.errors).Undefined();

        const data = result.data;
        if (data === undefined) return should(data).not.Undefined();
        if (data.withKubeconfig === undefined) return should(data.withKubeconfig).not.Undefined();

        const podList = data.withKubeconfig.listCoreV1NamespacedPod;
        if (podList === undefined) return should(podList).not.Undefined();

        should(podList.kind).equal("PodList");
        should(podList.apiVersion).Undefined();
        checkPods(podList.items);
    });

});
