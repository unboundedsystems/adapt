import * as randomstring from "randomstring";
import { InternalError } from "../error";
import { HistoryEntry, HistoryName, HistoryStatus, HistoryStore } from "./history";
import { AdaptServer } from "./server";

export interface Deployment {
    readonly deployID: string;
    getDataDir(withStatus: HistoryStatus): Promise<string>;
    releaseDataDir(): Promise<void>;
    commitEntry(toStore: HistoryEntry): Promise<void>;
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    lastEntry(withStatus: HistoryStatus): Promise<HistoryEntry | undefined>;
}

const deploymentPath = "/deployments";
const maxTries = 100;
const invalidChars = RegExp("[:/]", "g");

function dpath(deployID: string) {
    deployID = deployID.replace(invalidChars, "_");
    return `${deploymentPath}/${deployID}`;
}

function makeName(base: string) {
    const rand = randomstring.generate({
        length: 4,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${base}-${rand}`;
}

export async function createDeployment(server: AdaptServer, projectName: string,
    stackName: string): Promise<Deployment> {
    const baseName = `${projectName}::${stackName}`;
    let deployID = baseName;

    for (let i = 0; i < maxTries; i++) {
        const deployData = {
            state: "new",
            deployID,
        };
        try {
            await server.set(dpath(deployID), deployData, { mustCreate: true });
            break;
        } catch (err) {
            // continue
        }
        deployID = makeName(baseName);
    }

    const deployment = new DeploymentImpl(deployID, server);
    await deployment.init();
    return deployment;
}

export async function loadDeployment(server: AdaptServer, deployID: string):
    Promise<Deployment> {
    try {
        // Validate that the deployment exists
        await server.get(dpath(deployID));
    } catch (err) {
        throw new Error(`Deployment '${deployID}' does not exist`);
    }

    const deployment = new DeploymentImpl(deployID, server);
    await deployment.init();
    return deployment;
}

export async function destroyDeployment(server: AdaptServer, deployID: string):
    Promise<void> {
    let history: HistoryStore | undefined;
    const errs: string[] = [];
    try {
        history = await server.historyStore(dpath(deployID), false);
    } catch (e) {
        // Not an error if the store is not found. If there's no entry
        // for this deployID, server.delete will give the right error to the
        // caller.
    }

    try {
        await server.delete(dpath(deployID));
    } catch (err) {
        errs.push(err.message || err.toString());
    }
    try {
        if (history) await history.destroy();
    } catch (err) {
        errs.push(err.message || err.toString());
    }

    if (errs.length > 0) {
        const msg = `Error deleting deployment '${deployID}': ` +
            errs.join(" and ");
        throw new Error(msg);
    }
}

export async function listDeployments(server: AdaptServer): Promise<string[]> {
    try {
        const deps = await server.get(deploymentPath);
        return Object.keys(deps).map((key) => deps[key].deployID);
    } catch (err) {
        throw new Error(`Error listing deployments: ${err}`);
    }
}

class DeploymentImpl implements Deployment {
    private historyStore_?: HistoryStore;

    constructor(public deployID: string, private server: AdaptServer) {}

    init = async () => {
        this.historyStore_ = await this.server.historyStore(dpath(this.deployID), true);
    }

    getDataDir = (withStatus: HistoryStatus) => this.historyStore.getDataDir(withStatus);
    releaseDataDir = () => this.historyStore.releaseDataDir();
    commitEntry = (toStore: HistoryEntry) => this.historyStore.commitEntry(toStore);
    historyEntry = (name: string) => this.historyStore.historyEntry(name);
    lastEntry = (withStatus: HistoryStatus) => this.historyStore.last(withStatus);

    private get historyStore() {
        if (this.historyStore_ == null) throw new InternalError(`null historyStore`);
        return this.historyStore_;
    }

}
