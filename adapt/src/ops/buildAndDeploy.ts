import * as path from "path";

import {
    AdaptElementOrNull,
    build,
    Message,
    MessageLogger,
    ProjectBuildError,
    serializeDom,
} from "..";
import { createPluginManager } from "../plugin_support";
import { Deployment } from "../server/deployment";
import { getStacks, } from "../stack";
import { createStateStore, StateStore } from "../state";
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

    let stateStore: StateStore;
    try {
        stateStore = createStateStore(options.prevStateJson);
    } catch (err) {
        let msg = `Invalid previous state JSON`;
        if (err.message) msg += `: ${err.message}`;
        throw new Error(msg);
    }

    let newDom: AdaptElementOrNull = null;
    let buildMessages: Message[] = [];

    if (stack.root != null) {
        const output = build(stack.root, stack.style, {stateStore});
        newDom = output.contents;
        buildMessages = output.messages;
    }
    const domXml = serializeDom(newDom, true);

    if (buildMessages.length !== 0) {
        logger.append(buildMessages);
        throw new ProjectBuildError(domXml);
    }

    const stateJson = stateStore.serialize();

    const mgr = createPluginManager(deployment.pluginConfig);
    await mgr.start(prevDom, newDom, { logger });
    await mgr.observe();
    mgr.analyze();
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
