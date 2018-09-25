import { Action, AdaptElement, build, buildPrinter, StateStore } from "@usys/adapt";
import * as randomstring from "randomstring";
import * as should from "should";
import * as util from "util";

const debugBuild = false;
const buildOpts = debugBuild ? { recorder: buildPrinter() } : undefined;

export async function doBuild(elem: AdaptElement, stateStore?: StateStore) {
    const { contents: dom, messages } = await build(elem, null,
        { ...buildOpts, stateStore });
    if (dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    should(messages).have.length(0);
    return dom;
}

export async function act(actions: Action[]) {
    for (const action of actions) {
        try {
            await action.act();
        } catch (e) {
            throw new Error(`${action.description}: ${util.inspect(e)}`);
        }
    }
}

export function randomName(base: string) {
    const rand = randomstring.generate({
        length: 10,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${base}-${rand}`;
}
