import * as ld from "lodash";
import * as path from "path";
import * as readPkgUp from "read-pkg-up";

import * as when from "when";
import { UnbsElement } from ".";
import { getAdaptContext } from "./ts";
import { Logger } from "./type_support";

export interface PluginConfig {
    plugins: Plugin[];
}

export interface Action {
    description: string;
    act(): Promise<void>;
}

export interface PluginOptions {
    log: Logger;
}

export interface Plugin {
    start(options: PluginOptions): Promise<void>;
    observe(dom: UnbsElement): Promise<void>; //Pull data needed for analyze
    analyze(dom: UnbsElement /*, status FIXME(manishv) add */): Action[];
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
    start(dom: UnbsElement, options: PluginManagerStartOptions): Promise<void>;
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

class PluginManagerImpl implements PluginManager {
    plugins: Plugin[];
    dom?: UnbsElement | null;
    actions?: Action[];
    log?: Logger;
    state: PluginManagerState;

    constructor(config: PluginConfig) {
        this.plugins = config.plugins;
        this.state = PluginManagerState.Initial;
    }

    transitionTo(next: PluginManagerState) {
        if (!legalStateTransition(this.state, next)) {
            throw new Error(`Illegal call to Plugin Manager, attempting to go from ${this.state} to ${next}`);
        }
        this.state = next;
    }

    async start(dom: UnbsElement | null, options: PluginManagerStartOptions) {
        this.transitionTo(PluginManagerState.Starting);
        this.dom = dom;
        this.log = options.log;

        const loptions = { log: options.log }; //FIXME(manishv) have a per-plugin log here
        const waitingFor = this.plugins.map((plugin) => plugin.start(loptions));
        await Promise.all(waitingFor);
        this.transitionTo(PluginManagerState.PreObserve);
    }

    async observe() {
        this.transitionTo(PluginManagerState.Observing);
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before observe");
        const waitingFor = this.plugins.map((plugin) => plugin.observe(dom));
        await Promise.all(waitingFor);
        this.transitionTo(PluginManagerState.PreAnalyze);
    }

    analyze() {
        this.transitionTo(PluginManagerState.Analyzing);
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before analyze");
        const actionsTmp = this.plugins.map((plugin) => plugin.analyze(dom));
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
        const waitingFor = this.plugins.map((plugin) => plugin.finish());
        await Promise.all(waitingFor);
        this.dom = undefined;
        this.actions = undefined;
        this.log = undefined;
        this.transitionTo(PluginManagerState.Initial);
    }
}

export interface RegisterPlugin {
    module: NodeModule;
    create(): Plugin;
}

interface PackageInfo {
    name: string;
    version: string;
}

interface PluginModule extends RegisterPlugin {
    name: string;
    version: string;
}

type PluginModules = Map<string, PluginModule>;

export function registerPlugin(plugin: RegisterPlugin) {
    const modules = getPluginModules(true);
    const pInfo = findPackageInfo(path.dirname(plugin.module.filename));
    const mod: PluginModule = { ...plugin, ...pInfo };

    const existing = modules.get(mod.name);
    if (existing !== undefined) {
        throw new Error(`Attempt to register multiple plugins with the same name '${mod.name}'`);
    }
    modules.set(mod.name, mod);
}

export function createPluginConfig(): PluginConfig {
    const plugins: Plugin[] = [];
    const modules = getPluginModules();
    if (modules == null) throw new Error(`No plugins registered`);

    modules.forEach((mod) => {
        plugins.push(mod.create());
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

function findPackageInfo(dir: string): PackageInfo {
    const ret = readPkgUp.sync({cwd: dir, normalize: false });
    const pkgJson = ret.pkg;
    if (!pkgJson || !pkgJson.name || !pkgJson.version) {
        throw new Error(`Invalid plugin registration. Cannot find package.json info in directory ${dir}.`);
    }
    return {
        name: pkgJson.name,
        version: pkgJson.version,
    };
}
