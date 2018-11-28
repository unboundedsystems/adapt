import {
    Logger,
    mapMap,
    MessageLogger,
} from "@usys/utils";
import * as fs from "fs-extra";
import * as ld from "lodash";
import pMapSeries from "p-map-series";
import * as path from "path";
import { AdaptElementOrNull } from "./jsx";
import { findPackageInfo } from "./packageinfo";
import { getAdaptContext } from "./ts";

type PluginKey = string;
type PluginInstances = Map<PluginKey, Plugin>;
type PluginModules = Map<PluginKey, PluginModule>;

export interface PluginRegistration {
    name: string;
    module: NodeModule;
    create(): Plugin;
}

export interface PluginModule extends PluginRegistration {
    packageName: string;
    version: string;
}

export interface PluginConfig {
    plugins: PluginInstances;
    modules: PluginModules;
}

export interface Action {
    description: string;
    act(): Promise<void>;
}

export interface PluginOptions {
    deployID: string;
    log: Logger;
    dataDir: string;
}

export interface PluginObservations {
    [pluginKey: string]: object;
}

export interface Plugin<Observations extends object = object> {
    seriesActions?: boolean;
    start(options: PluginOptions): Promise<void>;
    observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations>; //Pull data needed for analyze
    analyze(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    deployID: string;
    logger: MessageLogger;
    dataDir: string;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface PluginManager {
    start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<PluginObservations>;
    analyze(): Action[];
    act(dryRun: boolean): Promise<ActionResult[]>;
    finish(): Promise<void>;
}

export function createPluginManager(modules: PluginModules): PluginManager {
    const config = createPluginConfig(modules);
    return new PluginManagerImpl(config);
}

function logError(action: Action, err: any, logger: Logger) {
    logger(`--Error during ${action.description}\n${err}\n----------`);
}

enum PluginManagerState {
    Initial = "Initial",
    Starting = "Starting",
    PreObserve = "PreObserve",
    Observing = "Observing",
    PreAnalyze = "PreAnalyze",
    Analyzing = "Analyzing",
    PreAct = "PreAct",
    Acting = "Acting",
    PreFinish = "PreFinish",
    Finishing = "Finishing"
}

function legalStateTransition(prev: PluginManagerState, next: PluginManagerState): boolean {
    switch (prev) {
        case PluginManagerState.Initial:
            return next === PluginManagerState.Starting;
        case PluginManagerState.Starting:
            return next === PluginManagerState.PreObserve;
        case PluginManagerState.PreObserve:
            return next === PluginManagerState.Observing;
        case PluginManagerState.Observing:
            return next === PluginManagerState.PreAnalyze;
        case PluginManagerState.PreAnalyze:
            return next === PluginManagerState.Analyzing;
        case PluginManagerState.Analyzing:
            return next === PluginManagerState.PreAct;
        case PluginManagerState.PreAct:
            return [
                PluginManagerState.Finishing, // finish without acting
                PluginManagerState.Acting
            ].find((v) => v === next) !== undefined;
        case PluginManagerState.Acting:
            return [
                PluginManagerState.PreAct, //  dryRun
                PluginManagerState.PreFinish  // !dryRun
            ].find((v) => v === next) !== undefined;
        case PluginManagerState.PreFinish:
            return next === PluginManagerState.Finishing;
        case PluginManagerState.Finishing:
            return next === PluginManagerState.Initial;
    }
}

interface AnyObservation {
    [name: string]: any;
}

class PluginManagerImpl implements PluginManager {
    plugins: PluginInstances;
    modules: PluginModules;
    dom?: AdaptElementOrNull;
    prevDom?: AdaptElementOrNull;
    parallelActions: Action[] = [];
    seriesActions: Action[][] = [];
    logger?: MessageLogger;
    state: PluginManagerState;
    observations: AnyObservation;

    constructor(config: PluginConfig) {
        this.plugins = new Map(config.plugins);
        this.modules = new Map(config.modules);
        this.state = PluginManagerState.Initial;
    }

    transitionTo(next: PluginManagerState) {
        if (!legalStateTransition(this.state, next)) {
            throw new Error(`Illegal call to Plugin Manager, attempting to go from ${this.state} to ${next}`);
        }
        this.state = next;
    }

    async start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions) {
        this.transitionTo(PluginManagerState.Starting);
        this.dom = dom;
        this.prevDom = prevDom;
        this.logger = options.logger;
        this.observations = {};

        const loptions = {
            deployID: options.deployID,
            log: options.logger.info, //FIXME(manishv) have a per-plugin log here
        };
        const waitingFor = mapMap(this.plugins, async (key, plugin) => {
            const pMod = this.modules.get(key);
            if (!pMod) throw new Error(`Internal error: no module found for ${key}`);
            const dataDir = pluginDataDir(options.dataDir, pMod);
            await fs.ensureDir(dataDir);
            return plugin.start({
                dataDir,
                ...loptions
            });
        });

        await Promise.all(waitingFor);
        this.transitionTo(PluginManagerState.PreObserve);
    }

    async observe() {
        this.transitionTo(PluginManagerState.Observing);
        const dom = this.dom;
        const prevDom = this.prevDom;
        if (dom === undefined || prevDom === undefined) {
            throw new Error("Must call start before observe");
        }
        const observationsP = mapMap(
            this.plugins,
            async (key, plugin) => ({ pluginKey: key, obs: await plugin.observe(prevDom, dom) }));
        const observations = await Promise.all(observationsP);
        const ret: PluginObservations = {};
        for (const { pluginKey: key, obs } of observations) {
            this.observations[key] = JSON.stringify(obs);
            ret[key] = obs;
        }

        this.transitionTo(PluginManagerState.PreAnalyze);
        return ret;
    }

    analyze() {
        this.transitionTo(PluginManagerState.Analyzing);
        const dom = this.dom;
        const prevDom = this.prevDom;
        if (dom === undefined || prevDom === undefined) {
            throw new Error("Must call start before analyze");
        }

        this.parallelActions = [];
        this.seriesActions = [];

        for (const [name, plugin] of this.plugins) {
            const obs = JSON.parse(this.observations[name]);
            this.addActions(plugin.analyze(prevDom, dom, obs), plugin);
        }

        this.transitionTo(PluginManagerState.PreAct);
        return this.parallelActions.concat(ld.flatten(this.seriesActions));
    }

    addActions(actions: Action[], plugin: Plugin) {
        if (plugin.seriesActions) {
            this.seriesActions.push(actions);
        } else {
            this.parallelActions = this.parallelActions.concat(actions);
        }
    }

    async act(dryRun: boolean) {
        let errored = false;
        this.transitionTo(PluginManagerState.Acting);
        const log = this.logger;
        if (log == undefined) throw new Error("Must call start before act");

        const doing = (action: Action) => log.info(`Doing ${action.description}...`);
        const doAction = async (action: Action) => {
            try {
                doing(action);
                await action.act();
                return { action };
            } catch (err) {
                errored = true;
                logError(action, err, (m) => log.error(m));
                return { action, err };
            }
        };

        if (dryRun) {
            const actions = this.parallelActions.concat(ld.flatten(this.seriesActions));
            actions.forEach(doing);
            this.transitionTo(PluginManagerState.PreAct);
            return actions.map((action) => ({ action }));
        } else {
            // Kick off ALL of these in parallel.
            // TODO(mark): At some point, this may be so much stuff that we
            // need to limit concurrency.
            const pParallel: Promise<ActionResult>[] =
                this.parallelActions.map(doAction);

            // The actions within each group must run in series, but kick off all
            // the groups in parallel.
            const pSeries = this.seriesActions.map((group) => pMapSeries(group, doAction));

            let results = await Promise.all(pParallel);
            results = results.concat(ld.flatten(await Promise.all(pSeries)));
            if (errored) throw new Error(`Errors encountered during plugin action phase`);
            this.transitionTo(PluginManagerState.PreFinish);
            return results;
        }
    }

    async finish() {
        this.transitionTo(PluginManagerState.Finishing);
        const waitingFor = mapMap(this.plugins, (_, plugin) => plugin.finish());
        await Promise.all(waitingFor);
        this.dom = undefined;
        this.prevDom = undefined;
        this.seriesActions = [];
        this.parallelActions = [];
        this.logger = undefined;
        this.observations = {};
        this.transitionTo(PluginManagerState.Initial);
    }
}

function pluginKey(pMod: PluginModule): PluginKey {
    return `${pMod.name} [${pMod.packageName}@${pMod.version}]`;
}

function pluginDataDir(dataDirRoot: string, pMod: PluginModule): string {
    return path.join(dataDirRoot, `${pMod.packageName}@${pMod.version}`, pMod.name);
}

export function registerPlugin(plugin: PluginRegistration) {
    const modules = getAdaptContext().pluginModules;
    const pInfo = findPackageInfo(path.dirname(plugin.module.filename));
    const mod = {
        ...plugin,
        packageName: pInfo.name,
        version: pInfo.version,
    };
    const key = pluginKey(mod);

    const existing = modules.get(key);
    if (existing !== undefined) {
        // Ignore if they're registering the exact same info
        if (existing.create === plugin.create) return;
        throw new Error(
            `Attempt to register two plugins with the same name from the ` +
            `same package: ${key}`);
    }
    modules.set(key, mod);
}

export function createPluginConfig(modules: PluginModules): PluginConfig {
    if (modules.size === 0) throw new Error(`No plugins registered`);
    const plugins: PluginInstances = new Map<PluginKey, Plugin>();

    for (const [key, mod] of modules) {
        plugins.set(key, mod.create());
    }
    return { modules, plugins };
}
