import { Action } from "@usys/adapt";
import * as randomstring from "randomstring";
import * as util from "util";

// tslint:disable-next-line:no-submodule-imports
export { doBuild } from "@usys/adapt/dist/test/testlib";

export async function act(actions: Action[]) {
    for (const action of actions) {
        try {
            await action.act();
        } catch (e) {
            throw new Error(`${action.detail} Action failed: ${util.inspect(e)}`);
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

export function makeDeployId(prefix: string) {
    const rand = randomstring.generate({
        length: 4,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${prefix}-${rand}`;
}
