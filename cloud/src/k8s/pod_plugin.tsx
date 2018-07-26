import Adapt, { UnbsElement } from "@usys/adapt";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
//const k8s = require("kubernetes-client");

export interface PodPlugin extends Adapt.Plugin {
    observations: undefined;
}

export function createPodPlugin() {
    return new PodPluginImpl();
}

export class PodPluginImpl implements PodPlugin {
    logger: ((...args: any[]) => void) | undefined;
    observations: undefined;

    async start(options: Adapt.PluginOptions) {
        this.logger = options.log;
    }

    async observe(_dom: UnbsElement): Promise<void> {
//        const client = new k8s.Client({ this.props.config });
//        await client.loadSpec();

        return;
    }

    analyze(_dom: UnbsElement): Adapt.Action[] {
        return [];
    }

    async finish() {
        this.logger = undefined;
    }

}
