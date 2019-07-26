import {
    describeLong,
    k8sutils,
} from "@adpt/testutils";
import { sleep } from "@adpt/utils";
import execa from "execa";
import fs from "fs-extra";
import { expect } from "../common/fancy";
import { mkInstance } from "../common/start-minikube";
import { getNewDeployID } from "../common/testlib";
import { curlOptions, systemAppSetup, systemTestChain } from "./common";

const { deleteAll, getAll } = k8sutils;

// NOTE(mark): These tests use the same project directory to deploy multiple
// times, both to test that functionality and to reduce setup runtime (mostly
// from NPM).
describeLong("tshello system tests", function () {
    let kClient: k8sutils.KubeClient;
    let kDeployID: string | undefined;
    let dockerHost: string;

    this.timeout(6 * 60 * 1000);

    systemAppSetup.all("tshello");

    before(async function () {
        this.timeout(60 * 1000 + mkInstance.setupTimeoutMs);
        const results = await Promise.all([
            mkInstance.client,
            mkInstance.info,
            fs.outputJson("kubeconfig.json", await mkInstance.kubeconfig),
        ]);

        kClient = results[0];
        const ctrInfo = await results[1].container.inspect();
        dockerHost = ctrInfo.Name;
        if (dockerHost.startsWith("/")) dockerHost = dockerHost.slice(1);
        if (!dockerHost) {
            // tslint:disable-next-line:no-console
            console.log(`Minikube ctrInfo`, ctrInfo);
            throw new Error(`Error getting minikube endpoint`);
        }
    });

    afterEach(async function () {
        this.timeout(65 * 1000);
        if (kDeployID && kClient) {
            await Promise.all([
                deleteAll("pods", { client: kClient, deployID: kDeployID }),
                deleteAll("services", { client: kClient, deployID: kDeployID }),
            ]);
            kDeployID = undefined;
        }
    });

    systemTestChain
    .delayedenv(() => ({ DOCKER_HOST: dockerHost }))

    .command(["run", "prod"])
    .do(async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(grep(stdout, "Validating project [completed]")).has.length(1);
        expect(grep(stdout, "Creating new project deployment [completed]")).has.length(1);
        expect(grep(stdout, "INFO: Doing Creating Pod")).has.length(1);

        kDeployID = getNewDeployID(stdout);

        let pods: any;
        let i: number;
        for (i = 120; i > 0; i--) {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(1);
            expect(pods[0] && pods[0].status).to.be.an("object").and.not.null;

            // containerStatuses can take a moment to populate
            if (pods[0].status.containerStatuses) {
                expect(pods[0].status.containerStatuses).to.be.an("array").with.length(1);
                if ((pods[0].status.phase === "Running") &&
                    (pods[0].status.containerStatuses[0].ready)) {
                    break;
                }
            }
            await sleep(1000);
        }
        if (i <= 0) throw new Error(`Pods did not become ready`);

        const ret = await execa("curl", [
            ...curlOptions,
            `http://${dockerHost}:8080/`
        ]);
        expect(ret.stdout).equals("Hello World! via TypeScript");

        // Delete the pod out from under the deployment
        const result = await kClient.api.v1.namespaces("default").pods(pods[0].metadata.name).delete();
        expect(result.statusCode).equals(200);
    })

    // Update with no change to spec
    .delayedcommand(() => ["update", kDeployID!])
    .it("Should deploy tshello to k8s and handle deleted pod", async ({ stdout, stderr }) => {
        expect(stderr).equals("");

        // Should have re-created pod
        expect(grep(stdout, "INFO: Doing Creating Pod")).has.length(2);

        const ret = await execa("curl", [
            ...curlOptions,
            `http://${dockerHost}:8080/`
        ]);
        expect(ret.stdout).equals("Hello World! via TypeScript");
    });
});

function grep(s: string, pat: RegExp | string): string[] {
    return s.split("\n").filter((l) => {
        return (typeof pat === "string") ?
            l.includes(pat) : pat.test(l);
    });
}
