import should from "should";
import {
    AdaptElement,
    AdaptMountedElement,
    build,
    buildPrinter,
    FinalDomElement,
    StateStore,
} from "../../src";
import { isBuildOutputPartial } from "../../src/dom";

export interface DoBuildOpts {
    deployID?: string;
    stateStore?: StateStore;
    debug?: boolean;
    style?: AdaptElement | null;
}
export interface DoBuildOptsNullOk extends DoBuildOpts {
    nullDomOk: true;
}

export interface DoBuild {
    mountedOrig: AdaptMountedElement;
    dom: FinalDomElement;
}
export interface DoBuildNullOk {
    mountedOrig: AdaptMountedElement | null;
    dom: FinalDomElement | null;
}

const doBuildDefaults = {
    deployID: "<none>",
    debug: false,
    style: null,
    nullDomOk: false,
};

export async function doBuild(elem: AdaptElement, options?: DoBuildOpts): Promise<DoBuild>;
export async function doBuild(elem: AdaptElement, options: DoBuildOptsNullOk): Promise<DoBuildNullOk>;
export async function doBuild(elem: AdaptElement, options: DoBuildOpts & Partial<DoBuildNullOk> = {}
    ): Promise<DoBuild | DoBuildNullOk>  {

    const { deployID, nullDomOk, stateStore, debug, style } = { ...doBuildDefaults, ...options };
    const buildOpts = {
        recorder: debug ? buildPrinter() : undefined,
        deployID,
        stateStore,
    };
    const buildOutput = await build(elem, style, buildOpts);
    if (isBuildOutputPartial(buildOutput)) {
        should(buildOutput.buildErr).be.False();
        should(buildOutput.partialBuild).be.False();
        throw new Error("Partially built DOM");
    }
    const { mountedOrig, contents: dom, messages } = buildOutput;
    should(messages).have.length(0);
    if (!nullDomOk && dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    return { mountedOrig, dom };
}
