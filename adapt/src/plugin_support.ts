import * as ld from "lodash";

import * as when from "when";
import { UnbsElement } from ".";

export interface PluginConfig {
    plugins: Plugin[];
}

export interface Action {
    description: string;
    act(): Promise<void>;
}

export interface PluginOptions {
    log: (...args: any[]) => void;
}

export interface Plugin {
    start(options: PluginOptions): Promise<void>;
    observe(dom: UnbsElement): Promise<void>; //Pull data needed for analyze
    analyze(dom: UnbsElement /*, status FIXME(manishv) add */): Action[];
    finish(): Promise<void>;
}

export interface PluginManagerStartOptions {
    log: (...args: any[]) => void;
}

export interface ActionResult {
    action: Action;
    err?: any;
}

export interface PluginManager {
    start(dom: UnbsElement, options: PluginManagerStartOptions): Promise<void>;
    observe(): Promise<void>;
    analyze(): Promise<void>;
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

class PluginManagerImpl implements PluginManager {
    private plugins: Plugin[];
    private dom?: UnbsElement | null;
    private actions?: Action[];
    private log?: (...args: any[]) => void;

    constructor(config: PluginConfig) {
        this.plugins = config.plugins;
    }

    async start(dom: UnbsElement | null, options: PluginManagerStartOptions) {
        this.dom = dom;
        this.log = options.log;

        const loptions = { log: options.log }; //FIXME(manishv) have a per-plugin log here
        const waitingFor = this.plugins.map((plugin) => plugin.start(loptions));
        await Promise.all(waitingFor);
    }

    async observe() {
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before observe");
        const waitingFor = this.plugins.map((plugin) => plugin.observe(dom));
        await Promise.all(waitingFor);
    }

    async analyze() {
        const dom = this.dom;
        if (dom == undefined) throw new Error("Must call start before analyze");
        const waitingFor = this.plugins.map((plugin) => plugin.analyze(dom));
        const actionsTmp = await Promise.all(waitingFor);
        this.actions = ld.flatten(actionsTmp);
    }

    async act(dryRun: boolean) {
        const actions = this.actions;
        const log = this.log;
        if (actions == undefined) throw new Error("Must call analyze before act");
        if (log == undefined) throw new Error("Must call start before act");

        actions.map((action) => log(`Doing ${action.description}...`));
        if (dryRun) {
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

            return results;
        }
    }

    async finish() {
        this.dom = undefined;
        this.actions = undefined;
        this.log = undefined;
    }
}
