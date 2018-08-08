import * as path from "path";

import {
    AdaptElementOrNull,
    build,
    serializeDom,
} from "..";
import { createPluginManager } from "../plugin_support";
import { Deployment } from "../server/deployment";
import { getStacks, } from "../stack";
import { createStateStore } from "../state";
import {
    exec,
    MemFileHost,
} from "../ts";
import { Logger } from "../type_support";
import { DeployState } from "./common";

export interface BuildOptions {
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    prevDom: AdaptElementOrNull;
    prevStateJson: string;
    log: Logger;
    stackName: string;

    projectRoot?: string;
}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    const { deployment, stackName } = options;

    const fileName = path.resolve(options.fileName);
    const projectRoot = options.projectRoot || path.dirname(fileName);

    const fileExt = path.extname(fileName);
    const importName = path.basename(fileName, fileExt);

    const host = MemFileHost("/", projectRoot);
    const context = Object.create(null);

    const wrapper = `
        require("source-map-support").install();
        require("./${importName}");
        `;
    const wrapperFileName = path.join(projectRoot, "[wrapper].ts");
    host.writeFile(wrapperFileName, wrapper, false);
    exec([wrapperFileName, fileName], { context, host });

    const stacks = getStacks();
    if (!stacks) throw new Error(`No stacks found`);
    const stack = stacks[stackName];
    if (!stack) throw new Error(`Stack '${stackName}' not found`);
    if (stack.root == null) {
        throw new Error(`Invalid stack '${stackName}': root is null`);
    }

    const stateStore = createStateStore(options.prevStateJson);

    const output = build(stack.root, stack.style, {stateStore});
    const dom = output.contents;
    if (dom == null) {
        throw new Error(`build returned a null DOM`);
    }

    const domXml = serializeDom(dom, true);
    const stateJson = stateStore.serialize();

    const mgr = createPluginManager(deployment.pluginConfig);
    await mgr.start(null, dom, { log: options.log });
    await mgr.observe();
    await mgr.analyze();
    await mgr.act(options.dryRun);
    await mgr.finish();

    return {
        deployID: deployment.deployID,
        domXml,
        stateJson,
        messages: output.messages,
    };
}
