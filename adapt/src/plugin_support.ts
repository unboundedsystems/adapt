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

export interface PluginManager {
    start(dom: UnbsElement): Promise<void>;
    observe(): Promise<void>;
    analyze(): Promise<void>;
    act(dryRun: boolean): Promise<void>;
    finish(): Promise<void>;
}

export function createPluginManager(config: PluginConfig): PluginManager {
    return new PluginManagerImpl(config);
}

class PluginManagerImpl implements PluginManager {
    plugins: Plugin[];
    dom: UnbsElement | null | undefined;

    constructor(config: PluginConfig) {
        this.plugins = config.plugins;
    }

    async start(dom: UnbsElement | null) {
        this.dom = dom;

        const options = { log: console.log }; //FIXME(manishv) have a per-plugin log here
        const waitingFor = this.plugins.map((plugin) => plugin.start(options));
        await Promise.all(waitingFor);
    }

    async observe() { }
    async analyze() { }
    async act(dryRun: boolean) { }

    async finish() {
        this.dom = undefined;
    }
}