import * as fs from "fs-extra";
import * as ld from "lodash";
import * as path from "path";
import {
    AdaptElementOrNull,
    Logger,
    MessageLogger,
} from ".";
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

function mapMap<K, V, T>(map: Map<K, V>, f: (key: K, val: V) => T): T[] {
    const ret: T[] = [];
    for (const [k, v] of map.entries()) {
        ret.push(f(k, v));
    }
    return ret;
}

interface AnyObservation {
    [name: string]: any;
}

class PluginManagerImpl implements PluginManager {
    plugins: PluginInstances;
    modules: PluginModules;
    dom?: AdaptElementOrNull;
    prevDom?: AdaptElementOrNull;
    actions?: Action[];
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
        const actionsTmp = mapMap(
            this.plugins,
            (name, plugin) => {
                const obs = JSON.parse(this.observations[name]);
                return plugin.analyze(prevDom, dom, obs);
            });

        this.actions = ld.flatten(actionsTmp);
        this.transitionTo(PluginManagerState.PreAct);
        return this.actions;
    }

    async act(dryRun: boolean) {
        let errored = false;
        this.transitionTo(PluginManagerState.Acting);
        const actions = this.actions;
        const log = this.logger;
        if (actions == undefined) throw new Error("Must call analyze before act");
        if (log == undefined) throw new Error("Must call start before act");

        actions.map((action) => log.info(`Doing ${action.description}...`));
        if (dryRun) {
            this.transitionTo(PluginManagerState.PreAct);
            return actions.map((action) => ({ action }));
        } else {
            const wrappedActions: Promise<ActionResult>[] = actions.map(async (action) => {
                try {
                    await action.act();
                    return { action };
                } catch (err) {
                    errored = true;
                    logError(action, err, (m) => log.error(m));
                    return { action, err };
                }
            });

            const results = await Promise.all(wrappedActions);
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
        this.actions = undefined;
        this.logger = undefined;
        this.observations = {};
        this.transitionTo(PluginManagerState.Initial);
    }
}

function pluginKey(pMod: PluginModule): PluginKey {
    return `${pMod.name} [${pMod.packageName}@${pMod.version}]`;
}

function pluginDataDir(dataDirRoot: string, pMod: PluginModule): string {
    return path.join(dataDirRoot, "plugins",
        `${pMod.packageName}@${pMod.version}`, pMod.name);
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
