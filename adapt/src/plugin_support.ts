import * as ld from "lodash";
import * as path from "path";
import * as when from "when";
import { AdaptElementOrNull } from ".";
import { findPackageInfo } from "./packageinfo";
import { getAdaptContext } from "./ts";
import { Logger } from "./type_support";

type RegisteredPlugins = Map<string, Plugin>; //string is the name of the plugin

export interface PluginConfig {
    plugins: RegisteredPlugins;
}

export interface Action {
    description: string;
    act(): Promise<void>;
}

export interface PluginOptions {
    log: Logger;
}

export interface Plugin<Observations extends object = object> {
    start(options: PluginOptions): Promise<void>;
    observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations>; //Pull data needed for analyze
    analyze(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    log: Logger;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface PluginManager {
    start(dom: AdaptElementOrNull, options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<void>;
    analyze(): Action[];
    act(dryRun: boolean): Promise<ActionResult[]>;
    finish(): Promise<void>;
}

export function createPluginManager(config: PluginConfig): PluginManager {
    return new PluginManagerImpl(config);
}

function logError(action: Action, err: any, logger: (e: string) => void) {
    logger(`--Error during ${action.description}`);
    logger(err);
    logger(`----------`);
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
    plugins: Map<string, Plugin>;
    dom?: AdaptElementOrNull;
    actions?: Action[];
    log?: Logger;
    state: PluginManagerState;
    observations: AnyObservation;

    constructor(config: PluginConfig) {
        this.plugins = new Map(config.plugins);
        this.state = PluginManagerState.Initial;
    }

    transitionTo(next: PluginManagerState) {
        if (!legalStateTransition(this.state, next)) {
            throw new Error(`Illegal call to Plugin Manager, attempting to go from ${this.state} to ${next}`);
        }
        this.state = next;
    }

    async start(dom: AdaptElementOrNull, options: PluginManagerStartOptions) {
        this.transitionTo(PluginManagerState.Starting);
        this.dom = dom;
        this.log = options.log;
        this.observations = {};

        const loptions = { log: options.log }; //FIXME(manishv) have a per-plugin log here
        const waitingFor = mapMap(this.plugins, (_, plugin) => plugin.start(loptions));
        await Promise.all(waitingFor);
        this.transitionTo(PluginManagerState.PreObserve);
    }

    async observe() {
        this.transitionTo(PluginManagerState.Observing);
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before observe");
        const observationsP = mapMap(
            this.plugins,
            async (name, plugin) => ({ name, obs: await plugin.observe(null, dom) }));
        const observations = await Promise.all(observationsP);
        for (const { name, obs } of observations) {
            this.observations[name] = JSON.stringify(obs);
        }

        this.transitionTo(PluginManagerState.PreAnalyze);
    }

    analyze() {
        this.transitionTo(PluginManagerState.Analyzing);
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before analyze");
        const actionsTmp = mapMap(
            this.plugins,
            (name, plugin) => {
                const obs = JSON.parse(this.observations[name]);
                return plugin.analyze(null, dom, obs);
            });

        this.actions = ld.flatten(actionsTmp);
        this.transitionTo(PluginManagerState.PreAct);
        return this.actions;
    }

    async act(dryRun: boolean) {
        this.transitionTo(PluginManagerState.Acting);
        const actions = this.actions;
        const log = this.log;
        if (actions == undefined) throw new Error("Must call analyze before act");
        if (log == undefined) throw new Error("Must call start before act");

        actions.map((action) => log(`Doing ${action.description}...`));
        if (dryRun) {
            this.transitionTo(PluginManagerState.PreAct);
            return actions.map((action) => ({ action }));
        } else {
            const wrappedActions = actions.map(async (action) => {
                try {
                    await action.act();
                } catch (e) {
                    logError(action, e, (m) => log(m));
                    throw e;
                }
            });

            const rawResults = await when.settle<void>(wrappedActions);
            const results = ld.zipWith(actions, rawResults,
                (act: Action, result: when.Descriptor<void>) => {
                    if (result.state === "rejected") {
                        return { action: act, err: result.reason };
                    } else {
                        return { action: act };
                    }
                });

            this.transitionTo(PluginManagerState.PreFinish);
            return results;
        }
    }

    async finish() {
        this.transitionTo(PluginManagerState.Finishing);
        const waitingFor = mapMap(this.plugins, (_, plugin) => plugin.finish());
        await Promise.all(waitingFor);
        this.dom = undefined;
        this.actions = undefined;
        this.log = undefined;
        this.observations = {};
        this.transitionTo(PluginManagerState.Initial);
    }
}

export interface PluginRegistration {
    module: NodeModule;
    create(): Plugin;
}

interface PluginModule extends PluginRegistration {
    name: string;
    version: string;
}

type PluginModules = Map<string, PluginModule>;

export function registerPlugin(plugin: PluginRegistration) {
    const modules = getPluginModules(true);
    const pInfo = findPackageInfo(path.dirname(plugin.module.filename));
    const mod = { ...plugin, ...pInfo };

    const existing = modules.get(mod.name);
    if (existing !== undefined) {
        throw new Error(`Attempt to register multiple plugins with the same name '${mod.name}'`);
    }
    modules.set(mod.name, mod);
}

export function createPluginConfig(): PluginConfig {
    const plugins: RegisteredPlugins = new Map<string, Plugin>();
    const modules = getPluginModules();
    if (modules == null) throw new Error(`No plugins registered`);

    modules.forEach((mod) => {
        plugins.set(mod.name, mod.create());
    });
    return { plugins };
}

function getPluginModules(create = false): PluginModules {
    const aContext = getAdaptContext();
    if (!aContext.pluginModules && create === true) {
        aContext.pluginModules = new Map<string, PluginModule>();
    }
    return aContext.pluginModules;
}
