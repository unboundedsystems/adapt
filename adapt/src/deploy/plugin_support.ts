import {
    createTaskObserver,
    Logger,
    mapMap,
    MessageLogger,
    TaskObserver,
    UserError,
} from "@usys/utils";
import * as fs from "fs-extra";
import * as ld from "lodash";
import pMapSeries from "p-map-series";
import * as path from "path";
import { domDiff, logElements } from "../dom_utils";
import { InternalError } from "../error";
import {
    AdaptElementOrNull,
    AdaptMountedElement,
    isMountedElement,
} from "../jsx";
import { findPackageInfo } from "../packageinfo";
import { Deployment } from "../server/deployment";
import { getAdaptContext } from "../ts";

import {
    Action,
    ActionResult,
    Plugin,
    PluginConfig,
    PluginInstances,
    PluginKey,
    PluginManager,
    PluginManagerStartOptions,
    PluginModule,
    PluginModules,
    PluginObservations,
    PluginRegistration,
} from "./deploy_types";

export function createPluginManager(modules: PluginModules): PluginManager {
    const config = createPluginConfig(modules);
    return new PluginManagerImpl(config);
}

function logError(action: Action, err: any, logger: Logger) {
    action.changes.forEach((c) => {
        logger(`--Error while ${c.detail}\n${err}\n----------`);
    });
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

export function checkPrimitiveActions(
    oldDom: AdaptElementOrNull,
    newDom: AdaptElementOrNull,
    actions: Action[]) {

    if (oldDom && !isMountedElement(oldDom)) {
        throw new InternalError(`oldDom is not Mounted`);
    }
    if (newDom && !isMountedElement(newDom)) {
        throw new InternalError(`newDom is not Mounted`);
    }
    const hasPlugin = (el: AdaptMountedElement) => !el.componentType.noPlugin;
    const changes = ld.flatten(actions.map((a) => a.changes));
    const done = new Set<AdaptMountedElement>();
    const diff = domDiff(oldDom, newDom);

    // The set of elements that should be claimed by plugins (i.e. referenced
    // in a change) is all elements in the new DOM (added+commonNew) and
    // all elements deleted from the old DOM, then filtered by the noPlugin
    // flag.
    const newEls = new Set([...diff.added, ...diff.commonNew].filter(hasPlugin));
    const deleted = new Set([...diff.deleted].filter(hasPlugin));

    changes.forEach((c) => {
        const el = c.element;
        if (!isMountedElement(el)) throw new InternalError(`Element is not mounted`);
        if (!hasPlugin(el)) return;

        // Only check each el once to avoid triggering warning if el is in
        // more than one change.
        if (done.has(el)) return;
        done.add(el);

        if (!newEls.delete(el) && !deleted.delete(el)) {
            logElements(`WARNING: Element was specified as affected by a ` +
                `plugin action but was not found in old or new DOM as expected:\n` +
                // tslint:disable-next-line: no-console
                `(change: ${c.detail}): `, [el], console.log);
        }
    });

    if (newEls.size > 0) {
        logElements(`WARNING: The following new or updated elements were ` +
            `not claimed by any deployment plugin and will probably not be ` +
            // tslint:disable-next-line: no-console
            `correctly deployed:\n`, [...newEls], console.log);
    }
    if (deleted.size > 0) {
        logElements(`WARNING: The following deleted elements were ` +
            `not claimed by any deployment plugin and will probably not be ` +
            // tslint:disable-next-line: no-console
            `correctly deleted:\n`, [...deleted], console.log);
    }
}

interface AnyObservation {
    [name: string]: any;
}

class PluginManagerImpl implements PluginManager {
    plugins: PluginInstances;
    modules: PluginModules;
    deployment?: Deployment;
    dom?: AdaptElementOrNull;
    prevDom?: AdaptElementOrNull;
    parallelActions: Action[] = [];
    seriesActions: Action[][] = [];
    logger?: MessageLogger;
    state: PluginManagerState;
    observations: AnyObservation;
    taskObserver_?: TaskObserver;
    tasks = new WeakMap<Action, TaskObserver[]>();

    constructor(config: PluginConfig) {
        this.plugins = new Map(config.plugins);
        this.modules = new Map(config.modules);
        this.state = PluginManagerState.Initial;
    }

    get taskObserver() {
        if (!this.taskObserver_) throw new InternalError(`PluginManager: taskObserver is null`);
        return this.taskObserver_;
    }

    set taskObserver(newTaskObserver: TaskObserver) {
        this.taskObserver_ = newTaskObserver;
        this.createTasks();
    }

    transitionTo(next: PluginManagerState) {
        if (!legalStateTransition(this.state, next)) {
            throw new InternalError(`Illegal call to Plugin Manager, attempting to go from ${this.state} to ${next}`);
        }
        this.state = next;
    }

    async start(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull,
        options: PluginManagerStartOptions) {
        this.transitionTo(PluginManagerState.Starting);
        this.dom = dom;
        this.prevDom = prevDom;
        this.deployment = options.deployment;
        this.logger = options.logger;
        this.observations = {};
        this.taskObserver_ = options.taskObserver ||
            createTaskObserver("pluginAction", {
                logger: this.logger,
                description: "Default plugin manager action task",
            });

        const loptions = {
            deployID: options.deployment.deployID,
            log: options.logger.info, //FIXME(manishv) have a per-plugin log here
        };
        const waitingFor = mapMap(this.plugins, async (key, plugin) => {
            const pMod = this.modules.get(key);
            if (!pMod) throw new InternalError(`no module found for ${key}`);
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
            throw new InternalError("Must call start before observe");
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
            throw new InternalError("Must call start before analyze");
        }

        this.parallelActions = [];
        this.seriesActions = [];

        for (const [name, plugin] of this.plugins) {
            const obs = JSON.parse(this.observations[name]);
            const actions = plugin.analyze(prevDom, dom, obs);
            this.createTasks(name, actions);
            this.addActions(actions, plugin);
        }

        checkPrimitiveActions(prevDom, dom, this.actions);

        this.transitionTo(PluginManagerState.PreAct);
        return this.actions;
    }

    addActions(actions: Action[], plugin: Plugin) {
        if (plugin.seriesActions) {
            this.seriesActions.push(actions);
        } else {
            this.parallelActions = this.parallelActions.concat(actions);
        }
    }

    async act(dryRun: boolean) {
        if (this.taskObserver_ == null) {
            throw new InternalError(
                `PluginManager: A new TaskObserver must be provided for additional calls to act()`);
        }
        let errored = false;
        this.transitionTo(PluginManagerState.Acting);
        const log = this.logger;
        if (log == undefined) throw new InternalError("Must call start before act");

        const doing = (action: Action) => {
            action.changes.forEach((c) => log.info(`Doing ${c.detail}`));
        };
        const doAction = async (action: Action) => {
            const tlist = this.getTaskList(action);
            try {
                doing(action);
                tlist.forEach((t) => t.started());
                await action.act();
                tlist.forEach((t) => t.complete());
                return { action };
            } catch (err) {
                errored = true;
                logError(action, err, (m) => log.error(m));
                tlist.forEach((t) => t.failed(err));
                return { action, err };
            }
        };

        if (dryRun) {
            const actions = this.actions;
            actions.forEach((action) => {
                doing(action);
                this.getTaskList(action).forEach((o) => o.skipped());
            });
            this.transitionTo(PluginManagerState.PreAct);
            // Can only use a taskObserver once
            this.taskObserver_ = undefined;
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
            if (errored) throw new UserError(`Errors encountered during plugin action phase`);
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

    private get actions(): Action[] {
        return this.parallelActions.concat(ld.flatten(this.seriesActions));
    }

    private getTaskList(action: Action): TaskObserver[] {
        const list = this.tasks.get(action);
        if (!list) throw new InternalError(`Unable to find task for Action`);
        return list;
    }

    private createTasks(pluginName?: string, actions?: Action[]) {
        const aList = actions || this.actions;
        if (aList.length === 0) return;

        let taskId = 0;
        const taskName = (a: Action, i: number) => {
            if (pluginName) return `${pluginName}.${taskId++}.${i}`;
            // Get the already assigned name
            return this.getTaskList(a)[i].name;
        };

        const tGroup = this.taskObserver.childGroup({ serial: false });
        for (const a of aList) {
            const tlist = a.changes.map((c, i) => {
                const name = taskName(a, i);
                const task = tGroup.add({ [name]: c.detail });
                return task[name];
            });
            this.tasks.set(a, tlist);
        }
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
