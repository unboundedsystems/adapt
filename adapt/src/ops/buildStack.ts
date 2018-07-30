import * as path from "path";

import {
    build,
    Message,
    serializeDom,
} from "..";
import { createPluginManager } from "../plugin_support";
import { adaptServer } from "../server";
import { createDeployment, loadDeployment } from "../server/deployment";
import { getStacks, } from "../stack";
import { createStateStore } from "../state";
import {
    exec,
    MemFileHost,
} from "../ts";
import { Logger } from "../type_support";

export interface BuildState {
    domXml: string;
    stateJson: string;
    messages: Message[];
    deployId?: string;
}

export interface BuildOptions {
    adaptUrl: string;
    fileName: string;
    initialStateJson: string;
    projectName: string;
    deployID: string;
    stackName: string;

    dryRun?: boolean;
    initLocalServer?: boolean;
    log?: Logger;
    projectRoot?: string;
}

const defaultOptions = {
    dryRun: false,
    initLocalServer: false,
    // tslint:disable-next-line:no-console
    log: console.log,
    projectRoot: undefined,
};

export async function buildStack(options: BuildOptions): Promise<BuildState> {
    const finalOptions = { ...defaultOptions, ...options };
    const { deployID, projectName, stackName } = finalOptions;

    const server = await adaptServer(finalOptions.adaptUrl, {
        init: finalOptions.initLocalServer,
    });

    const fileName = path.resolve(finalOptions.fileName);
    const projectRoot = finalOptions.projectRoot || path.dirname(fileName);

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

    const stateStore = createStateStore(finalOptions.initialStateJson);

    const output = build(stack.root, stack.style, {stateStore});
    const dom = output.contents;
    if (dom == null) {
        throw new Error(`build returned a null DOM`);
    }

    const domXml = serializeDom(dom);
    const stateJson = stateStore.serialize();

    const deployment = (deployID === "new") ?
        await createDeployment(server, projectName, stackName) :
        await loadDeployment(server, deployID);

    const mgr = createPluginManager(deployment.pluginConfig);
    await mgr.start(dom, { log: finalOptions.log });
    await mgr.observe();
    await mgr.analyze();
    await mgr.act(finalOptions.dryRun);
    await mgr.finish();

    return {
        domXml,
        stateJson,
        messages: output.messages,
    };
}
