import {
    describeLong,
    k8sutils,
    minikubeMocha,
    mochaTmpdir,
} from "@usys/testutils";
import { sleep } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { expect } from "../common/fancy";
import { getNewDeployID } from "../common/testlib";
import { projectsRoot, systemTestChain } from "./common";

const { deleteAll, getAll } = k8sutils;

// NOTE(mark): These tests use the same project directory to deploy multiple
// times, both to test that functionality and to reduce setup runtime (mostly
// from NPM).
describeLong("tshello system tests", function () {
    let kClient: k8sutils.KubeClient;
    let kDeployID: string | undefined;
    let dockerHost: string;

    this.timeout(6 * 60 * 1000);

    const minikube = minikubeMocha.all();

    const copyDir = path.join(projectsRoot, "tshello");
    mochaTmpdir.all("adapt-cli-test-tshello", { copy: copyDir });

    before(async function () {
        this.timeout(2 * 60 * 1000);
        // tslint:disable-next-line:no-console
        console.log(`    Installing Docker`);
        const results = await Promise.all([
            minikube.client,
            minikube.info.container.inspect(),
            fs.outputJson("kubeconfig.json", minikube.kubeconfig),
            execa("sh", [ "/src/bin/install-docker.sh" ]),
        ]);

        kClient = results[0];
        const ctrInfo = results[1];
        dockerHost = ctrInfo.NetworkSettings.IPAddress;
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
    .command(["deploy:create", "--init", "prod"])

    .it("Should deploy tshello to k8s", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        kDeployID = getNewDeployID(stdout);

        let pods: any;
        for (let i = 0; i < 120; i++) {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(1);
            expect(pods[0] && pods[0].status).to.be.an("object").and.not.null;

            // containerStatuses can take a moment to populate
            if (pods[0].status.containerStatuses == null) continue;

            expect(pods[0].status.containerStatuses).to.be.an("array").with.length(1);
            if ((pods[0].status.phase === "Running") &&
                (pods[0].status.containerStatuses[0].ready)) {
                break;
            }
            await sleep(1000);
        }
        expect(pods[0].spec.containers).to.have.length(1);

        const ret = await execa("curl", [ `http://${dockerHost}:8080/` ]);
        expect(ret.stdout).equals("Hello World! via TypeScript");
    });
});
