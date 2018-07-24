import * as path from "path";

import {
    build,
    Message,
    serializeDom,
} from "..";
import { getStacks, } from "../stack";
import { createStateStore } from "../state";
import {
    exec,
    MemFileHost,
} from "../ts";

export interface BuildState {
    domXml: string;
    stateJson: string;
    messages: Message[];
}

export interface BuildOptions {
    rootDir?: string;
}

const defaultOptions: BuildOptions = {
};

export function buildStack(fileName: string, stackName: string,
                           initialStateJson: string, options?: BuildOptions
): BuildState {
    const finalOptions = { ...defaultOptions, ...options };

    fileName = path.resolve(fileName);
    const projectRoot = finalOptions.rootDir || path.dirname(fileName);

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

    const stateStore = createStateStore(initialStateJson);

    const output = build(stack.root, stack.style, {stateStore});
    if (output.contents == null) {
        throw new Error(`build returned a null DOM`);
    }

    const domXml = serializeDom(output.contents);
    const stateJson = stateStore.serialize();

    return {
        domXml,
        stateJson,
        messages: output.messages,
    };
}
