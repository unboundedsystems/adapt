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
    AdaptElementOrNull,
    Message,
    MessageLogger,
    ProjectBuildError,
} from "..";

// @ts-ignore
// tslint:disable-next-line:variable-name prefer-const
let Adapt: never;

import { InternalError } from "../error";
import { AdaptMountedElement } from "../jsx";
import {
    ExecutedQuery,
} from "../observers";
import { createPluginManager } from "../plugin_support";
import { Deployment } from "../server/deployment";
import { createStateStore, StateStore } from "../state";
import { Status } from "../status";
import { AdaptContext, projectExec } from "../ts";
import { DeployState, DeploySuccess } from "./common";
import { parseFullObservationsJson, stringifyFullObservations } from "./serialize";

export interface BuildOptions {
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    logger: MessageLogger;
    stackName: string;

    withStatus?: boolean;
    observationsJson?: string;
    prevStateJson?: string;
    projectRoot?: string;
}

interface FullBuildOptions extends Required<BuildOptions> {
    ctx?: AdaptContext;
}

export function computePaths(options: BuildOptions): { fileName: string, projectRoot: string } {
    const fileName = path.resolve(options.fileName);
    const projectRoot = options.projectRoot || path.dirname(fileName);
    return { fileName, projectRoot };
}

export function initialState(options: BuildOptions): FullBuildOptions {
    const paths = computePaths(options);
    return {
        ...options,
        ...paths,
        withStatus: options.withStatus || false,
        observationsJson: options.observationsJson || JSON.stringify({}),
        prevStateJson: options.prevStateJson || "{}",
    };
}

export async function currentState(options: BuildOptions): Promise<FullBuildOptions> {
    const { deployment } = options;
    const prev = await deployment.lastEntry();
    if (!prev) return initialState(options);
    const paths = computePaths(options);
    return {
        ...options,
        ...paths,
        withStatus: options.withStatus || false,
        observationsJson: options.observationsJson || prev.observationsJson,
        prevStateJson: options.prevStateJson || prev.stateJson
    };
}

interface ExecutedQueries {
    [name: string]: ExecutedQuery[];
}

export interface BuildResults extends FullBuildOptions {
    domXml: string;
    mountedOrigStatus: Status;
    executedQueries: ExecutedQueries;
    needsData: ExecutedQueries;
}

function podify<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

export async function build(options: FullBuildOptions): Promise<BuildResults> {
    return withContext(options, async (ctx: AdaptContext) => {
        const { deployment, logger, stackName } = options;

        const prevStateJson = options.prevStateJson;
        const observations = parseFullObservationsJson(options.observationsJson);
        const observerObservations = observations.observer || {};

        // Compile and run the project

        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;

        const stacks = ctx.adaptStacks;
        if (!stacks) throw new InternalError(`No stacks found`);
        const stack = stacks.get(stackName);
        if (!stack) throw new Error(`Adapt stack '${stackName}' not found`);

        let stateStore: StateStore;
        try {
            stateStore = createStateStore(prevStateJson);
        } catch (err) {
            let msg = `Invalid previous state JSON`;
            if (err.message) msg += `: ${err.message}`;
            throw new Error(msg);
        }

        let mountedOrig: AdaptMountedElement | null = null;
        let newDom: AdaptElementOrNull = null;
        let buildMessages: Message[] = [];
        let executedQueries: ExecutedQueries = {};

        let needsData: ExecutedQueries = {};
        const root = await stack.root;
        const style = await stack.style;
        if (root != null) {
            const observeManager = inAdapt.internal.makeObserverManagerDeployment(observerObservations);

            const results = await inAdapt.build(
                root, style, { stateStore, observerManager: observeManager, deployID: deployment.deployID });

            newDom = results.contents;
            mountedOrig = results.mountedOrig;
            buildMessages = results.messages;
            executedQueries = podify(observeManager.executedQueries());
            needsData = podify(observeManager.executedQueriesThatNeededData());
        }

        if (buildMessages.length !== 0) {
            logger.append(buildMessages);
            throw new ProjectBuildError(inAdapt.serializeDom(newDom));
        }

        return {
            ...options,
            domXml: inAdapt.serializeDom(newDom, true),
            mountedOrigStatus: (mountedOrig && options.withStatus) ?
                podify(await mountedOrig.status()) : { noStatus: true },
            needsData,
            executedQueries,
            prevStateJson: stateStore.serialize(),
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
    return withContext(options, async (ctx: AdaptContext) => {
        const { logger } = options;

        const origObservations = parseFullObservationsJson(options.observationsJson);
        // This is the inner context's copy of Adapt
        const inAdapt = ctx.Adapt;
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
}

export async function withContext<T>(
    options: FullBuildOptions,
    f: (ctx: AdaptContext) => T | Promise<T>): Promise<T> {

    let ctx: AdaptContext | undefined = options.ctx;
    if (ctx === undefined) {
        ctx = projectExec(options.projectRoot, options.fileName);
    }
    return f(ctx);
}

export async function deploy(options: BuildResults): Promise<DeployState> {
    const { deployment, stackName, logger, fileName, projectRoot } = options;

    return withContext(options, async (ctx: AdaptContext): Promise<DeploySuccess> => {
        try {
            // This is the inner context's copy of Adapt
            const inAdapt = ctx.Adapt;
            const prev = await deployment.lastEntry();

            const mgr = createPluginManager(ctx.pluginModules);
            const prevDom = prev ? await inAdapt.internal.reanimateDom(prev.domXml) : null;

            // This grabs a lock on the deployment's uncommitted data dir
            const dataDir = await deployment.getDataDir();

            const newDom = await inAdapt.internal.reanimateDom(options.domXml);
            await mgr.start(prevDom, newDom, {
                dataDir: path.join(dataDir, "plugins"),
                deployID: deployment.deployID,
                logger,
            });
            const newPluginObs = await mgr.observe();
            mgr.analyze();

            /*
            * NOTE: There should be no deployment side effects prior to here, but
            * once act is called, that is no longer true.
            */
            const observationsJson = stringifyFullObservations({
                plugin: newPluginObs,
                observer: parseFullObservationsJson(options.observationsJson).observer
            });

            if (!options.dryRun) {
                await deployment.commitEntry({
                    dataDir,
                    domXml: options.domXml,
                    stateJson: options.prevStateJson,
                    stackName,
                    projectRoot,
                    fileName,
                    observationsJson
                });
            }

            await mgr.act(options.dryRun);
            await mgr.finish();

            return {
                type: "success",
                deployID: deployment.deployID,
                domXml: options.domXml,
                stateJson: options.prevStateJson,
                //Move data from inner adapt to outer adapt via JSON
                needsData: JSON.parse(JSON.stringify((inAdapt.internal.simplifyNeedsData(options.needsData)))),
                messages: logger.messages,
                summary: logger.summary,
                mountedOrigStatus: options.mountedOrigStatus,
            };
        } finally {
            await deployment.releaseDataDir();
        }
    });

}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    const initial = await currentState(options);
    return withContext(initial, async (ctx: AdaptContext) => {
        const build1 = await build({ ...initial, ctx, withStatus: false });
        const obs = await observe(build1);
        const { needsData, ...build2Options } = obs;
        const build2 = await build({ ...build2Options, withStatus: true });
        return deploy(build2);
    });
}
