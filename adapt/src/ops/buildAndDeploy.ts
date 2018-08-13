import * as path from "path";

import {
    AdaptElementOrNull,
    build,
    MessageLogger,
    ProjectBuildError,
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
import { DeployState } from "./common";

export interface BuildOptions {
    deployment: Deployment;
    dryRun: boolean;
    fileName: string;
    prevDom: AdaptElementOrNull;
    prevStateJson: string;
    logger: MessageLogger;
    stackName: string;

    projectRoot?: string;
}

export async function buildAndDeploy(options: BuildOptions): Promise<DeployState> {
    const { deployment, logger, prevDom, stackName } = options;

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
    const newDom = output.contents;
    if (newDom == null) {
        throw new Error(`build returned a null DOM`);
    }
    const domXml = serializeDom(newDom, true);

    if (output.messages.length !== 0) {
        logger.append(output.messages);
        throw new ProjectBuildError(domXml);
    }

    const stateJson = stateStore.serialize();

    const mgr = createPluginManager(deployment.pluginConfig);
    await mgr.start(prevDom, newDom, { logger });
    await mgr.observe();
    await mgr.analyze();
    await mgr.act(options.dryRun);
    await mgr.finish();

    return {
        type: "success",
        deployID: deployment.deployID,
        domXml,
        stateJson,
        messages: logger.messages,
        summary: logger.summary,
    };
}
