import { mochaTmpdir } from "@usys/testutils";
import * as fs from "fs-extra";
import should from "should";

import { DeployStatus } from "../../src/deploy";
import {
    createDeployment,
    encodePathComponent,
    listDeploymentIDs,
    listDeployments,
} from "../../src/server/deployment";
import { dbFilename } from "../../src/server/local_server";
import { AdaptServer } from "../../src/server/server";
import { initLocalServer } from "./common";

describe("Deployment with local server", () => {
    let server: AdaptServer;
    mochaTmpdir.each("test-adapt-deployment");

    beforeEach(async () => {
        server = await initLocalServer(true);
    });

    async function create() {
        const d = await createDeployment(server, "proj", "stack");
        const { deployID } = d;
        should(deployID).match(/^proj::stack-[a-z]{4}$/);
        const db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentSequence: null,
                    deployID,
                    sequenceInfo: {},
                    stateDirs: [],
                }
            }
        });
        return d;
    }

    it("Should create and list deployment", async () => {
        let deployments = await listDeployments(server);
        should(deployments).have.length(0);
        let ids = await listDeploymentIDs(server);
        should(ids).have.length(0);

        const d = await create();
        deployments = await listDeployments(server);
        should(deployments).eql([
            { deployID: d.deployID }
        ]);

        ids = await listDeploymentIDs(server);
        should(ids).eql([ d.deployID ]);
    });

    const notActive = /^This deployment is not yet active/;

    it("Should error without the first deploy", async () => {
        const d = await create();
        await should(d.currentSequence()).be.rejectedWith(notActive);
        await should(d.status(0)).be.rejectedWith("Deployment sequence 0 not found");
        await should(d.status(0, {
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        })).be.rejectedWith(notActive);
        await should(d.elementStatus(0, "foo")).be.rejectedWith(notActive);
    });

    it("Should set and report sequence and status", async () => {
        const d = await create();
        const { deployID } = d;

        const seq = await d.newSequence();
        should(seq).equal(0);

        const db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentSequence: 0,
                    deployID,
                    sequenceInfo: {
                        0: {
                            deployStatus: DeployStatus.Initial,
                            goalStatus: DeployStatus.Initial,
                            elementStatus: {},
                        }
                    },
                    stateDirs: [],
                }
            }
        });

        let stat = await d.status(0);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        });
        await should(d.status(1)).be.rejectedWith("Deployment sequence 1 not found");

        const cur = await d.currentSequence();
        should(cur).equal(0);

        await d.status(0, {
            goalStatus: DeployStatus.Deployed,
        });
        stat = await d.status(0);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Deployed,
            elementStatus: {},
        });
    });

    it("Should set and report element status", async () => {
        const d = await create();
        const { deployID } = d;
        const seq = await d.newSequence();
        should(seq).equal(0);

        await d.elementStatus(0, { one: { deployStatus: DeployStatus.Initial }});
        let el = await d.elementStatus(0, "one");
        should(el).eql({ deployStatus: DeployStatus.Initial });

        const db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentSequence: 0,
                    deployID,
                    sequenceInfo: {
                        0: {
                            deployStatus: DeployStatus.Initial,
                            goalStatus: DeployStatus.Initial,
                            elementStatus: {
                                one: {
                                    deployStatus: DeployStatus.Initial
                                },
                            },
                        }
                    },
                    stateDirs: [],
                }
            }
        });

        let stat = await d.status(0);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {
                one: {
                    deployStatus: DeployStatus.Initial
                },
            },
        });

        await should(d.elementStatus(0, "two")).be.rejectedWith("ElementID 'two' not found");
        await d.elementStatus(0, { two: { deployStatus: DeployStatus.Failed, error: "oops" }});

        el = await d.elementStatus(0, "one");
        should(el).eql({ deployStatus: DeployStatus.Initial });
        el = await d.elementStatus(0, "two");
        should(el).eql({ deployStatus: DeployStatus.Failed, error: "oops" });

        stat = await d.status(0);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {
                one: {
                    deployStatus: DeployStatus.Initial
                },
                two: {
                    deployStatus: DeployStatus.Failed,
                    error: "oops"
                },
            },
        });
    });

    it("Should error on non-current sequence", async () => {
        const d = await create();
        const seq = await d.newSequence();
        should(seq).equal(0);

        await should(d.status(1, {
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        })).be.rejectedWith("Requested sequence (1) is not current (0)");
        await should(d.elementStatus(1, {})).be.rejectedWith("Requested sequence (1) is not current (0)");
    });

});
