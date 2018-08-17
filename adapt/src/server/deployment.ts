import * as randomstring from "randomstring";
import { createPluginConfig, PluginConfig } from "../plugin_support";
import { HistoryEntry, HistoryName, HistoryStore, HistoryWriter } from "./history";
import { AdaptServer } from "./server";

export interface Deployment {
    readonly deployID: string;
    readonly pluginConfig: PluginConfig;
    historyWriter(): Promise<HistoryWriter>;
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    lastEntry(): Promise<HistoryEntry | undefined>;
}

const deploymentPath = "/deployments";
const maxTries = 100;

function dpath(deployID: string) {
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

    const deployData = {
        state: "new",
    };

    for (let i = 0; i < maxTries; i++) {
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
        return Object.keys(await server.get(deploymentPath));
    } catch (err) {
        throw new Error(`Error listing deployments: ${err}`);
    }
}

class DeploymentImpl implements Deployment {
    private pluginConfig_?: PluginConfig;
    private historyStore?: HistoryStore;

    constructor(public deployID: string, private server: AdaptServer) {}

    async init() {
        this.historyStore = await this.server.historyStore(dpath(this.deployID), true);
    }

    get pluginConfig(): PluginConfig {
        if (!this.pluginConfig_) this.pluginConfig_ = createPluginConfig();
        return this.pluginConfig_;
    }

    async historyWriter(): Promise<HistoryWriter> {
        if (this.historyStore == null) throw new Error(`Internal error: null historyStore`);
        return this.historyStore.writer();
    }
    async historyEntry(historyName: HistoryName): Promise<HistoryEntry> {
        if (this.historyStore == null) throw new Error(`Internal error: null historyStore`);
        return this.historyStore.historyEntry(historyName);
    }
    async lastEntry(): Promise<HistoryEntry | undefined> {
        if (this.historyStore == null) throw new Error(`Internal error: null historyStore`);
        return this.historyStore.last();
    }
}
