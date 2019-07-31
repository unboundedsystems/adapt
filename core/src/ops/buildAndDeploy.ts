import db from "debug";
import * as path from "path";

/*
 * IMPORTANT NOTE
 * This file primarily operates on the results from the user's program,
 * which runs in its own V8 context. Don't use our (outer) Adapt or other
 * things imported here to operate on those results.
 * It is safe to use types from the outer context, but be VERY careful that
 * you know what you're doing if you import and use objects or functions
 * in this file.
 *
 * In order to make it more obvious which types/objects we're importing,
 * NEVER "import * from " in this file.
 */
// @ts-ignore
import AdaptDontUse, {
    ProjectBuildError,
} from "..";

// @ts-ignore
// tslint:disable-next-line:variable-name prefer-const
let Adapt: never;

import { MessageLogger, Omit, TaskObserver, TaskState, UserError } from "@adpt/utils";
import { createPluginManager } from "../deploy/plugin_support";
import { isBuildOutputError, isBuildOutputPartial, ProcessStateUpdates } from "../dom";
import { buildPrinter } from "../dom_build_data_recorder";
import { InternalError } from "../error";
import { AdaptMountedElement, FinalDomElement } from "../jsx";
import {
    ExecutedQuery,
} from "../observers";
import { Deployment } from "../server/deployment";
import { DeployOpID } from "../server/deployment_data";
import { HistoryEntry, HistoryStatus, isStatusComplete } from "../server/history";
import { createStateStore, StateStore } from "../state";
import { Status } from "../status";
import { AdaptContext, projectExec } from "../ts";
import { DeployState, parseDebugString } from "./common";
import { parseFullObservationsJson, stringifyFullObservations } from "./serialize";

const debugAction = db("adapt:ops:action");
const debugDeployDom = db("adapt:ops:deploydom");

export interface BuildOptions {
    debug: string;
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    taskObserver: TaskObserver;

    deployOpID?: DeployOpID;
    withStatus?: boolean;
    observationsJson?: string;
    prevStateJson?: string;
    projectRoot?: string;
    stackName?: string;
}

export type CommitData = Omit<HistoryEntry, "fileName" | "projectRoot" | "stackName" | "stateJson">;
export interface FullBuildOptions extends Required<BuildOptions> {
    ctx?: AdaptContext;
    commit: (entry: CommitData) => Promise<void>;
    stateStore: StateStore;
    prevDomXml: string | undefined;
}

export function computePaths(options: BuildOptions): { fileName: string, projectRoot: string } {
    const fileName = path.resolve(options.fileName);
    const projectRoot = options.projectRoot || path.dirname(fileName);
    return { fileName, projectRoot };
}

export async function currentState(options: BuildOptions): Promise<FullBuildOptions> {
    const { deployment } = options;
    let lastCommit: HistoryStatus | undefined;
    const paths = computePaths(options);
    const prev = await deployment.lastEntry(HistoryStatus.complete);

    const observationsJson = options.observationsJson ||
        (prev ? prev.observationsJson : "{}");
    const prevStateJson = options.prevStateJson ||
        (prev ? prev.stateJson : "{}");

    let stateStore: StateStore;
    try {
        stateStore = createStateStore(prevStateJson);
    } catch (err) {
        let msg = `Invalid previous state JSON`;
        if (err.message) msg += `: ${err.message}`;
        throw new Error(msg);
    }

    // Allocate a new opID for this operation if not provided
    const deployOpID = options.deployOpID !== undefined ?
        options.deployOpID : await deployment.newOpID();

    const stackName = options.stackName || (prev && prev.stackName);
    if (!stackName) {
        throw new Error(`stackName option not provided and previous ` +
            `stackName not present`);
    }

    const ret = {
        ...options,
        ...paths,
        commit,
        observationsJson,
        prevDomXml: prev && prev.domXml,
        prevStateJson,
        deployOpID,
        stackName,
        stateStore,
        withStatus: options.withStatus || false,
    };
    return ret;

    async function commit(entry: CommitData) {
        if (lastCommit === HistoryStatus.preAct &&
            entry.status === HistoryStatus.preAct) return;
        if (lastCommit && isStatusComplete(lastCommit)) {
            throw new InternalError(`Attempt to commit a repeated final ` +
                `HistoryStatus (${entry.status})`);
        }
        lastCommit = entry.status;

        if (!ret.dryRun) {
            await deployment.commitEntry({
                ...entry,
                fileName: ret.fileName,
                projectRoot: ret.projectRoot,
                stackName: ret.stackName,
                stateJson: stateStore.serialize(),
            });
        }
    }
}

interface ExecutedQueries {
    [name: string]: ExecutedQuery[];
}

export interface BuildResults extends FullBuildOptions {
    builtElements: AdaptMountedElement[];
    domXml: string;
    mountedOrigStatus: Status;
    executedQueries: ExecutedQueries;
    needsData: ExecutedQueries;
    newDom: FinalDomElement | null;
    processStateUpdates: ProcessStateUpdates;
}

function podify<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

export async function build(options: FullBuildOptions): Promise<BuildResults> {
    return withContext(options, async (ctx: AdaptContext) => {
        const { deployment, taskObserver, stackName, stateStore } = options;
        const logger = taskObserver.logger;

        const observations = parseFullObservationsJson(options.observationsJson);
        const observerObservations = observations.observer || {};
        const debugFlags = parseDebugString(options.debug);
        const recorder = debugFlags.build ? buildPrinter() : undefined;

        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;

        const stacks = ctx.adaptStacks;
        if (!stacks) throw new InternalError(`No stacks found`);
        const stack = stacks.get(stackName);
        if (!stack) throw new UserError(`Adapt stack '${stackName}' not found`);

        let builtElements: AdaptMountedElement[] = [];
        let mountedOrig: AdaptMountedElement | null = null;
        let newDom: FinalDomElement | null = null;
        let executedQueries: ExecutedQueries = {};
        let processStateUpdates: ProcessStateUpdates = () => Promise.resolve({ stateChanged: false });

        let needsData: ExecutedQueries = {};
        const root = await stack.root;
        const style = await stack.style;
        if (root != null) {
            const observeManager = inAdapt.internal.makeObserverManagerDeployment(observerObservations);

            const results = await inAdapt.build(
                root, style, {
                    deployID: deployment.deployID,
                    deployOpID: options.deployOpID,
                    observerManager: observeManager,
                    recorder,
                    stateStore,
                });

            if (results.buildErr || isBuildOutputPartial(results)) {
                logger.append(results.messages);
                throw new ProjectBuildError(inAdapt.serializeDom(results.contents));
            }

            builtElements = results.builtElements;
            newDom = results.contents;
            mountedOrig = results.mountedOrig;
            executedQueries = podify(observeManager.executedQueries());
            needsData = podify(observeManager.executedQueriesThatNeededData());
            processStateUpdates = results.processStateUpdates;
        }

        return {
            ...options,
            builtElements,
            ctx,
            domXml: inAdapt.serializeDom(newDom, { reanimateable: true }),
            mountedOrigStatus: (mountedOrig && options.withStatus) ?
                podify(await mountedOrig.status()) : { noStatus: true },
            needsData,
            newDom,
            executedQueries,
            prevStateJson: stateStore.serialize(),
            processStateUpdates,
        };
    });
}

interface ObserveResults extends FullBuildOptions {
    needsData: ExecutedQueries;
}

interface ObserveOptions extends ObserveResults {
    executedQueries: ExecutedQueries;
}

export async function observe(options: ObserveOptions): Promise<ObserveResults> {
    debugAction(`observe: start`);
    const ret = withContext(options, async (ctx: AdaptContext) => {
        const { taskObserver } = options;
        const logger = taskObserver.logger;

        const origObservations = parseFullObservationsJson(options.observationsJson);
        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;
        debugAction(`observe: run observers`);
        const observations = await inAdapt.internal.observe(options.executedQueries, logger);
        inAdapt.internal.patchInNewQueries(observations, options.executedQueries);
        const { executedQueries, ...orig } = options;
        return {
            ...orig,
            observationsJson: stringifyFullObservations({
                plugin: origObservations.plugin,
                observer: observations
            })
        };
    });
    debugAction(`observe: done`);
    return ret;
}

export async function withContext<T>(
    options: FullBuildOptions,
    f: (ctx: AdaptContext) => T | Promise<T>): Promise<T> {

    let ctx: AdaptContext | undefined = options.ctx;
    if (ctx === undefined) {
        // Compile and run the project
        debugAction(`buildAndDeploy: compile start`);
        const task = options.taskObserver.childGroup().task("compile");
        ctx = await task.complete(() => projectExec(options.projectRoot, options.fileName));
        debugAction(`buildAndDeploy: compile done`);
    }
    return f(ctx);
}

interface ReanimateOpts {
    ctx: AdaptContext;
    domXml: string;
    stateJson: string;
    deployID: string;
    deployOpID: DeployOpID;
    logger: MessageLogger;
}
async function reanimateAndBuild(opts: ReanimateOpts) {
    const inAdapt = opts.ctx.Adapt;
    const { deployID, deployOpID, domXml, logger } = opts;
    let stateStore: StateStore;
    try {
        stateStore = createStateStore(opts.stateJson);
    } catch (err) {
        let msg = `Invalid state JSON during reanimate`;
        if (err.message) msg += `: ${err.message}`;
        throw new Error(msg);
    }
    const zombie = await inAdapt.internal.reanimateDom(domXml, deployID, deployOpID);
    if (zombie === null) return null;
    const buildRes = await inAdapt.build(zombie, null, {
        deployID,
        deployOpID,
        buildOnce: true,
        stateStore,
    });
    if (buildRes.messages.length > 0) logger.append(buildRes.messages);
    if (isBuildOutputError(buildRes)) {
        throw new Error(`Error attempting to rebuild reanimated DOM`);
    }
    if (isBuildOutputPartial(buildRes)) {
        throw new Error(`Rebuilding reanimated DOM produced a partial build`);
    }
    const checkXML = inAdapt.serializeDom(buildRes.contents, { reanimateable: true });
    if (checkXML !== domXml) {
        logger.error(`Error comparing reanimated built dom to original:\n` +
            `Original:\n` + domXml + `\nCheck:\n` + checkXML);
        throw new Error(`Error comparing reanimated built dom to original`);
    }
    return buildRes.contents;
}

export interface DeployPassOptions extends FullBuildOptions {
    actTaskObserver: TaskObserver;
    dataDir: string;
    prevDom: FinalDomElement | null;
}
export interface DeployPassResults extends BuildResults {
    deployComplete: boolean;
    stateChanged: boolean;
}

export async function deployPass(options: DeployPassOptions): Promise<DeployPassResults> {
    const { actTaskObserver, dataDir, deployment, prevDom, taskObserver, ...buildOpts } = options;

    return withContext(options, async (ctx: AdaptContext): Promise<DeployPassResults> => {
        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;

        debugAction(`deployPass: rebuild`);
        taskObserver.updateStatus("Rebuilding DOM");
        const buildResults = await build({
            ...buildOpts,
            deployment,
            withStatus: true,
            taskObserver,
        });
        const { newDom, processStateUpdates } = buildResults;
        if (debugDeployDom.enabled) {
            debugDeployDom(inAdapt.serializeDom(newDom, { props: [ "key" ] }));
        }

        debugAction(`deployPass: observe`);
        taskObserver.updateStatus("Observing and analyzing environment");
        const mgr = createPluginManager(ctx.pluginModules);

        await mgr.start(prevDom, newDom, {
            dataDir: path.join(dataDir, "plugins"),
            deployment,
            logger: actTaskObserver.logger,
        });
        const newPluginObs = await mgr.observe();

        debugAction(`deployPass: analyze`);
        mgr.analyze();

        const observationsJson = stringifyFullObservations({
            plugin: newPluginObs,
            observer: parseFullObservationsJson(options.observationsJson).observer
        });

        /*
         * NOTE: There should be no deployment side effects prior to here, but
         * once act is called the first time, that is no longer true.
         */
        let status = HistoryStatus.preAct;
        await commit();
        status = HistoryStatus.failed;

        try {
            debugAction(`deployPass: act`);
            taskObserver.updateStatus("Applying changes to environment");
            if (actTaskObserver.state === TaskState.Created) {
                actTaskObserver.started();
            }
            const { deployComplete, stateChanged } = await mgr.act({
                builtElements: buildResults.builtElements,
                deployOpID: options.deployOpID,
                dryRun: options.dryRun,
                processStateUpdates,
                taskObserver: actTaskObserver,
            });
            await mgr.finish();

            debugAction(`deployPass: done (complete: ${deployComplete}, state changed: ${stateChanged})`);
            return {
                ...buildResults,
                deployComplete,
                stateChanged,
                observationsJson,
            };
        } catch (err) {
            await commit();
            throw err;
        }

        async function commit() {
            await options.commit({
                status,
                dataDir,
                domXml: buildResults.domXml,
                observationsJson,
            });
        }
    });
}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    debugAction(`buildAndDeploy: start`);
    const topTask = options.taskObserver;
    const tasks = topTask.childGroup().add({
        compile: "Compiling project",
        build: "Building new DOM",
        reanimatePrev: "Loading previous DOM",
        observe: "Observing environment",
        deploy: "Deploying",
    });
    const deployTasks = tasks.deploy.childGroup({ serial: false }).add({
        status: "Deployment progress",
        act: "Applying changes to environment",
    });
    const initial = await currentState(options);

    return withContext(initial, async (ctx: AdaptContext): Promise<DeployState> => {
        const { commit, deployment, stateStore } = initial;
        const deployID = deployment.deployID;
        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;

        // This grabs a lock on the deployment's uncommitted data dir
        const dataDir = await deployment.getDataDir(HistoryStatus.complete);

        try {
            debugAction(`buildAndDeploy: build deployOpID: ${initial.deployOpID}`);
            const build1 = await tasks.build.complete(() => build({
                ...initial,
                ctx,
                withStatus: false,
                taskObserver: tasks.build
            }));

            debugAction(`buildAndDeploy: reanimate`);
            const prevDom = await tasks.reanimatePrev.complete(async () => {
                return initial.prevDomXml ?
                    reanimateAndBuild({
                        ctx,
                        deployOpID: initial.deployOpID,
                        domXml: initial.prevDomXml,
                        stateJson: initial.prevStateJson,
                        deployID,
                        logger: tasks.reanimatePrev.logger,
                    }) : null;
            });

            debugAction(`buildAndDeploy: observe`);
            const observeOptions = {
                ...build1,
                taskObserver: tasks.observe
            };
            const obs = await tasks.observe.complete(() => observe(observeOptions));

            debugAction(`buildAndDeploy: deploy`);
            const { needsData, ...fromBuild } = obs;
            const passOpts: DeployPassOptions = {
                ...fromBuild,
                actTaskObserver: deployTasks.act,
                dataDir,
                prevDom,
                taskObserver: deployTasks.status,
            };
            const result = await tasks.deploy.complete(() =>
                deployTasks.status.complete(async () => {
                    try {
                        while (true) {
                            const res = await deployPass(passOpts);
                            if (!res.deployComplete && !res.stateChanged) {
                                throw new Error(`TODO: Need to implement retry/timeout still`);
                            }
                            if (res.deployComplete && !res.stateChanged) {
                                await commit({
                                    status: HistoryStatus.success,
                                    dataDir,
                                    domXml: res.domXml,
                                    observationsJson: res.observationsJson,
                                });
                                deployTasks.act.complete();
                                return res;
                            }
                        }
                    } catch (err) {
                        deployTasks.act.failed(err);
                        throw err;
                    }
                })
            );

            debugAction(`buildAndDeploy: done`);

            const logger = topTask.logger;
            return {
                type: "success",
                deployID: initial.dryRun ? "DRYRUN" : deployment.deployID,
                domXml: result.domXml,
                stateJson: stateStore.serialize(),
                //Move data from inner adapt to outer adapt via JSON
                needsData: podify(inAdapt.internal.simplifyNeedsData(result.needsData)),
                messages: logger.messages,
                summary: logger.summary,
                mountedOrigStatus: result.mountedOrigStatus,
            };

        } finally {
            await deployment.releaseDataDir();
        }
    });
}
