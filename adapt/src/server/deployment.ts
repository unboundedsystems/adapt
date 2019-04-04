import { cloneDeep, isError } from "lodash";
import * as randomstring from "randomstring";
import { DeployStatus } from "../deploy";
import { InternalError } from "../error";
import { ElementID } from "../jsx";
import { DeploymentInfo } from "../ops/listDeployments";
import {
    DeploymentSequence,
    DeploymentStored,
    ElementStatus,
    ElementStatusMap,
    SequenceInfo,
} from "./deployment_data";
import { HistoryEntry, HistoryName, HistoryStatus, HistoryStore } from "./history";
import { AdaptServer, ServerLock, withLock } from "./server";

export interface Deployment {
    readonly deployID: string;
    getDataDir(withStatus: HistoryStatus): Promise<string>;
    releaseDataDir(): Promise<void>;
    commitEntry(toStore: HistoryEntry): Promise<void>;
    historyEntry(historyName: HistoryName): Promise<HistoryEntry>;
    lastEntry(withStatus: HistoryStatus): Promise<HistoryEntry | undefined>;

    currentSequence(): Promise<DeploymentSequence>;
    newSequence(): Promise<DeploymentSequence>;
    status(sequence: DeploymentSequence): Promise<SequenceInfo>;
    status(sequence: DeploymentSequence, info: Partial<SequenceInfo>): Promise<void>;
    elementStatus(sequence: DeploymentSequence, elementID: ElementID): Promise<ElementStatus>;
    elementStatus(sequence: DeploymentSequence, statusMap: ElementStatusMap): Promise<void>;
}

const deploymentPath = "/deployments";
const maxTries = 100;
const invalidChars = RegExp("[:/]", "g");

export function encodePathComponent(comp: string) {
    return comp.replace(invalidChars, "_");
}

function dpath(deployID: string) {
    deployID = encodePathComponent(deployID);
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

function isPathNotFound(err: any) {
    // FIXME(mark): AdaptServer should have its own error. This is actually
    // specific to the current local server implementation. Encapsulating here
    // to make it easier to fix later.
    return isError(err) && err.name === "DataError";
}

export interface DeploymentOptions {
    fixedDeployID?: string; // For use with unit testing
}

export async function createDeployment(server: AdaptServer, projectName: string,
    stackName: string, options: DeploymentOptions = {}): Promise<Deployment> {
    const baseName = `${projectName}::${stackName}`;

    let deployID = "";

    for (let i = 0; i < maxTries; i++) {
        deployID = options.fixedDeployID || makeName(baseName);
        const deployData: DeploymentStored = {
            deployID,
            currentSequence: null,
            sequenceInfo: {},
            stateDirs: [],
        };
        try {
            await server.set(dpath(deployID), deployData, { mustCreate: true });
            break;
        } catch (err) {
            if (!isPathNotFound(err)) throw err;
            if (options.fixedDeployID) {
                throw new Error(`Fixed deployID '${deployID}' already exists`);
            }
            // continue
        }
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
        if (!isPathNotFound(err)) throw err;
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
    } catch (err) {
        if (!isPathNotFound(err)) throw err;
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

export async function listDeploymentIDs(server: AdaptServer): Promise<string[]> {
    try {
        const deps = await listDeployments(server);
        return deps.map((dep) => dep.deployID);
    } catch (err) {
        throw new Error(`Error listing deployments: ${err}`);
    }
}

export async function listDeployments(server: AdaptServer): Promise<DeploymentInfo[]> {
    try {
        const deps = await server.get(deploymentPath);
        return Object.keys(deps).map((key) => ({ deployID: deps[key].deployID }));
    } catch (err) {
        // deploymentPath may not have been set yet.
        if (isPathNotFound(err)) return [];
        throw new Error(`Error listing deployments: ${err}`);
    }
}

class DeploymentImpl implements Deployment {
    private historyStore_?: HistoryStore;
    private basePath_: string;

    constructor(public deployID: string, private server: AdaptServer) {
        this.basePath_ = dpath(this.deployID);
    }

    init = async () => {
        this.historyStore_ = await this.server.historyStore(this.basePath_, true);
    }

    getDataDir = (withStatus: HistoryStatus) => this.historyStore.getDataDir(withStatus);
    releaseDataDir = () => this.historyStore.releaseDataDir();
    commitEntry = (toStore: HistoryEntry) => this.historyStore.commitEntry(toStore);
    historyEntry = (name: string) => this.historyStore.historyEntry(name);
    lastEntry = (withStatus: HistoryStatus) => this.historyStore.last(withStatus);

    async status(sequence: DeploymentSequence): Promise<SequenceInfo>;
    async status(sequence: DeploymentSequence, info: Partial<SequenceInfo>): Promise<void>;
    async status(sequence: DeploymentSequence, info?: Partial<SequenceInfo>): Promise<SequenceInfo | void> {
        const path = `${this.basePath_}/sequenceInfo/${sequence}`;
        if (info !== undefined) {
            // Set
            return withLock(this.server, async (lock) => {
                await this.assertCurrent(sequence, lock);
                const cur = await this.server.get(path, { lock });
                await this.server.set(path, { ...cur, ...info }, { lock });
                return;
            });
        }

        // Get
        try {
            const i: SequenceInfo = await this.server.get(path);
            return cloneDeep(i);
        } catch (err) {
            if (!isPathNotFound(err)) throw err;
            throw new Error(`Deployment sequence ${sequence} not found`);
        }
    }

    async elementStatus(sequence: DeploymentSequence, elementID: ElementID): Promise<ElementStatus>;
    async elementStatus(sequence: DeploymentSequence, statusMap: ElementStatusMap): Promise<void>;
    async elementStatus(sequence: DeploymentSequence, idOrMap: ElementID | ElementStatusMap):
        Promise<ElementStatus | void> {

        const path = `${this.basePath_}/sequenceInfo/${sequence}/elementStatus`;

        return withLock(this.server, async (lock) => {
            // Get
            if (typeof idOrMap === "string") {
                await this.currentSequence(lock); // Throws if currentSequence===null
                try {
                    return await this.server.get(`${path}/${idOrMap}`, { lock });
                } catch (err) {
                    if (!isPathNotFound(err)) throw err;
                    throw new Error(`ElementID '${idOrMap}' not found`);
                }
            }

            // Set
            await this.assertCurrent(sequence, lock);
            let old: ElementStatusMap = {};
            try {
                old = await this.server.get(path, { lock });
            } catch (err) {
                if (!isPathNotFound(err)) throw err;
                // Fall through
            }
            await this.server.set(path, { ...old, ...idOrMap }, { lock });
        });
    }

    async newSequence(): Promise<DeploymentSequence> {
        return withLock(this.server, async (lock) => {
            const curPath = this.basePath_ + "/currentSequence";
            const cur: DeploymentStored["currentSequence"] =
                await this.server.get(curPath, { lock });
            const next = cur == null ? 0 : cur + 1;

            const info: SequenceInfo = {
                deployStatus: DeployStatus.Initial,
                goalStatus: DeployStatus.Initial,
                elementStatus: {},
            };
            await this.server.set(`${this.basePath_}/sequenceInfo/${next}`, info, { lock });
            await this.server.set(curPath, next, { lock });
            return next;
        });
    }

    async currentSequence(lock?: ServerLock): Promise<DeploymentSequence> {
        const path = this.basePath_ + "/currentSequence";
        const cur: DeploymentStored["currentSequence"] = await this.server.get(path, { lock });
        if (cur == null) {
            throw new Error(`This deployment is not yet active. ` +
                `(Sequence 0 has not been deployed)`);
        }
        return cur;
    }

    private get historyStore() {
        if (this.historyStore_ == null) throw new InternalError(`null historyStore`);
        return this.historyStore_;
    }

    private async assertCurrent(sequence: DeploymentSequence, lock: ServerLock) {
        const current = await this.currentSequence(lock);
        if (sequence !== current) {
            throw new Error(`Requested sequence (${sequence}) is not current (${current})`);
        }
    }
}
