import { cloneDeep, isEqual } from "lodash";
import * as path from "path";

import {
    build,
    BuildOutput,
    cloneElement,
    isPrimitiveElement,
    Message,
    serializeDom,
    UnbsElementOrNull,
} from "..";
import {
    KeyTracker,
    UpdateStateInfo,
} from "../keys";
import {
    getStacks,
    Stack,
} from "../stack";
import {
    exec,
    MemFileHost,
} from "../ts";
import { trace } from "../utils";

const debugBuildOp = false;

export interface BuildState {
    dom: UnbsElementOrNull;
    state: any;
    messages: Message[];
}

export interface BuildOptions {
    rootDir?: string;
}

const defaultOptions: BuildOptions = {
};

export function buildStack(fileName: string, stackName: string,
                           initialState: any, options?: BuildOptions
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

    return buildLoop(initialState, stack);
}

function buildLoop(initialState: any, stack: Stack): BuildState {
    const { root, style } = stack;
    let state = cloneDeep(initialState);
    let oldState = cloneDeep(state);
    let out: BuildOutput;
    const messages: Message[] = [];
    if (root == null) return { dom: null, state, messages };

    do {
        const newRoot = cloneElement(root, { store: state });
        out = build(newRoot, style || null);
        trace(debugBuildOp, "******************");
        for (const m of out.messages) {
            trace(debugBuildOp, `${m.type}: ${m.content}`);
        }
        messages.push(...out.messages);
        if (out.contents != null) {
            trace(debugBuildOp, serializeDom(out.contents));
        } else {
            trace(debugBuildOp, "null");
        }
        oldState = state;
        state = cloneDeep(initialState);
        if ((out.contents != null) && isPrimitiveElement(out.contents)) {
            const keys = new KeyTracker();
            const info = new UpdateStateInfo(keys);
            out.contents.updateState(state, keys, info);
            trace(debugBuildOp, "\n\nState:\n" + JSON.stringify(state, null, 2));
        }
    } while (!isEqual(oldState, state));
    return {
        dom: out.contents,
        state,
        messages
     };
}
