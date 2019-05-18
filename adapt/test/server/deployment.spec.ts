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
import { DeployStepID } from "../../src/server/deployment_data";
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
                    currentOpID: null,
                    deployID,
                    deployOpInfo: {},
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

    const notActive = /^Deployment .* is not yet active/;
    const firstStepID: DeployStepID = {
            deployOpID: 0,
            deployStepNum: 0,
    };

    it("Should error without the first deploy", async () => {
        const d = await create();
        await should(d.currentOpID()).be.rejectedWith(notActive);
        await should(d.status(firstStepID)).be.rejectedWith("Deployment step ID 0.0 not found");
        await should(d.status(firstStepID, {
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        })).be.rejectedWith(notActive);
        await should(d.elementStatus(firstStepID, "foo")).be.rejectedWith(notActive);
    });

    it("Should create OpID", async () => {
        const d = await create();

        const opID = await d.newOpID();
        should(opID).equal(0);
    });

    it("Should create StepIDs", async () => {
        const d = await create();

        const opID = await d.newOpID();
        should(opID).equal(0);

        let stepID = await d.newStepID(opID);
        should(stepID).eql(firstStepID);

        stepID = await d.newStepID(opID);
        should(stepID).eql({
            deployOpID: 0,
            deployStepNum: 1,
        });
    });

    it("Should not create StepID for old OpID", async () => {
        const d = await create();

        let opID = await d.newOpID();
        should(opID).equal(0);

        const stepID = await d.newStepID(opID);
        should(stepID).eql(firstStepID);

        opID = await d.newOpID();
        should(opID).equal(1);

        await should(d.newStepID(0)).be.rejectedWith("Requested DeployOpID (0) is not current (1)");
    });

    it("Should set and report step info and status", async () => {
        const d = await create();
        const { deployID } = d;

        const opID = await d.newOpID();

        let db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentOpID: 0,
                    deployID,
                    deployOpInfo: {
                        0: {
                            currentStepNum: null,
                        }
                    },
                    stateDirs: [],
                }
            }
        });

        const stepID = await d.newStepID(opID);
        should(stepID).eql(firstStepID);

        db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentOpID: 0,
                    deployID,
                    deployOpInfo: {
                        0: {
                            currentStepNum: 0,
                            0: {
                                deployStatus: DeployStatus.Initial,
                                goalStatus: DeployStatus.Initial,
                                elementStatus: {},
                            }
                        }
                    },
                    stateDirs: [],
                }
            }
        });

        let stat = await d.status(stepID);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        });
        await should(d.status({
            deployOpID: 0,
            deployStepNum: 1,
        })).be.rejectedWith("Deployment step ID 0.1 not found");

        const cur = await d.currentStepID(0);
        should(cur).eql(firstStepID);

        await d.status(stepID, {
            goalStatus: DeployStatus.Deployed,
        });
        stat = await d.status(stepID);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Deployed,
            elementStatus: {},
        });
    });

    it("Should set and report element status", async () => {
        const d = await create();
        const { deployID } = d;
        const stepID = await d.newStepID(await d.newOpID());
        should(stepID).eql(firstStepID);

        await d.elementStatus(stepID, { one: { deployStatus: DeployStatus.Initial }});
        let el = await d.elementStatus(stepID, "one");
        should(el).eql({ deployStatus: DeployStatus.Initial });

        const db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentOpID: 0,
                    deployID,
                    deployOpInfo: {
                        0: {
                            currentStepNum: 0,
                            0: {
                                deployStatus: DeployStatus.Initial,
                                goalStatus: DeployStatus.Initial,
                                elementStatus: {
                                    one: {
                                        deployStatus: DeployStatus.Initial
                                    },
                                },
                            }
                        }
                    },
                    stateDirs: [],
                }
            }
        });

        let stat = await d.status(stepID);
        should(stat).eql({
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {
                one: {
                    deployStatus: DeployStatus.Initial
                },
            },
        });

        await should(d.elementStatus(stepID, "two")).be.rejectedWith("ElementID 'two' not found");
        await d.elementStatus(stepID, { two: { deployStatus: DeployStatus.Failed, error: "oops" }});

        el = await d.elementStatus(stepID, "one");
        should(el).eql({ deployStatus: DeployStatus.Initial });
        el = await d.elementStatus(stepID, "two");
        should(el).eql({ deployStatus: DeployStatus.Failed, error: "oops" });

        stat = await d.status(stepID);
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

    it("Should error on non-current stepID", async () => {
        const d = await create();
        const stepID = await d.newStepID(await d.newOpID());
        should(stepID).eql(firstStepID);

        const badID: DeployStepID = {
            deployOpID: 0,
            deployStepNum: 1,
        };
        const errMsg = "Requested DeployStepID (0.1) is not current (0.0)";

        await should(d.status(badID, {
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        })).be.rejectedWith(errMsg);
        await should(d.elementStatus(badID, {})).be.rejectedWith(errMsg);
    });

    it("Should reset stepID to 0 on new opID", async () => {
        const d = await create();
        const { deployID } = d;
        const ids: [number, number][] = [];
        const addIDs = (step: DeployStepID) => {
            ids.push([step.deployOpID, step.deployStepNum]);
        };

        let opID = await d.newOpID();
        addIDs(await d.newStepID(opID));
        addIDs(await d.newStepID(opID));
        addIDs(await d.newStepID(opID));

        opID = await d.newOpID();
        addIDs(await d.newStepID(opID));

        opID = await d.newOpID();
        opID = await d.newOpID();
        addIDs(await d.newStepID(opID));
        addIDs(await d.newStepID(opID));

        opID = await d.newOpID();

        should(ids).eql([
            [ 0, 0],
            [ 0, 1],
            [ 0, 2],
            [ 1, 0],
            [ 3, 0],
            [ 3, 1],
        ]);

        const initialInfo = {
            deployStatus: DeployStatus.Initial,
            goalStatus: DeployStatus.Initial,
            elementStatus: {},
        };
        const db = await fs.readJSON(dbFilename);
        should(db).eql({
            adaptLocalServerVersion: 0,
            deployments: {
                [encodePathComponent(deployID)]: {
                    currentOpID: 4,
                    deployID,
                    deployOpInfo: {
                        0: {
                            currentStepNum: 2,
                            0: initialInfo,
                            1: initialInfo,
                            2: initialInfo,
                        },
                        1: {
                            currentStepNum: 0,
                            0: initialInfo,
                        },
                        2: {
                            currentStepNum: null,
                        },
                        3: {
                            currentStepNum: 1,
                            0: initialInfo,
                            1: initialInfo,
                        },
                        4: {
                            currentStepNum: null,
                        },
                    },
                    stateDirs: [],
                }
            }
        });
    });
});
