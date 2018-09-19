import * as should from "should";
import {
    expect,
    IsSameT,
} from "type-ops";

// Ensure these are publicly exported at the top level of resource_id
import {
    getResourceIds,
    resourceIdList,
    ResourceIdPolicy,
    ResourceIdProps,
    ResourceIdState,
    updateResourceIdState,
} from "../src/resource_id";

// Internally used exports
import {
    resourceIdConfig,
    StateEntry,
    StateWithResourceIds,
} from "../src/resource_id/resource_id";

const defaultIdOptions = {
    defaultBaseId: null,
    maxIdLength: null,
    randLength: 8,
    separator: "",
};

function replaceDynamicState<Keys extends string>(state: StateWithResourceIds<Keys>): StateWithResourceIds<Keys> {
    const ids: { [k: string]: StateEntry } = state.adaptResourceIds;
    const newIds: { [k: string]: StateEntry } = {};

    for (const k of Object.keys(ids)) {
        newIds[k] = replaceDynamic(ids[k]);
    }
    // tslint:disable-next-line:no-object-literal-type-assertion
    return { adaptResourceIds: newIds } as typeof state;
}

function replaceDynamic(entry: StateEntry): StateEntry {
    const { configured, currentId } = entry;
    if (!(configured.policy === ResourceIdPolicy.local || configured.baseId === null)) {
        return entry; // nothing dynamic
    }
    const base = configured.baseId === null ? configured.options.defaultBaseId : configured.baseId;
    const re = RegExp(`^(${base}${configured.options.separator})[a-z]{${configured.options.randLength}}$`);
    const m = re.exec(currentId);
    if (!m) {
        throw should(m).not.be.Null(); // currentId doesn't match expected regex
    }
    return {
        configured,
        currentId: m[1] + "X".repeat(configured.options.randLength)
    };
}

describe("ResourceId tests", () => {
    it("Should resourceIdList return array of args of correct type", () => {
        const idList = resourceIdList("prop1", "prop2", "prop3");
        should(idList).eql(["prop1", "prop2", "prop3"]);

        // Check for correct return type of tuple from resourceIdList
        expect<IsSameT<typeof idList, ["prop1", "prop2", "prop3"]>>().toBe(true);
        expect<IsSameT<typeof idList, string[]>>().toBe(false);
        expect<IsSameT<typeof idList, [string, string, string]>>().toBe(false);
    });

    it("Should getResourceIds return undefined if no state", () => {
        const idList = resourceIdList("someprop");
        should(getResourceIds(idList, {})).be.Undefined();
    });

    it("Should getResourceIds return current IDs from state", () => {
        const idList = resourceIdList("prop1", "prop2");
        // NOTE: the following assignment also checks that type ResourceIdState works correctly
        const state: ResourceIdState<typeof idList> = {
            adaptResourceIds: {
                prop1: {
                    configured: resourceIdConfig("prop1id",
                                                 ResourceIdPolicy.globalCreateOnly,
                                                 {}),
                    currentId: "prop1id",
                },
                prop2: {
                    configured: resourceIdConfig("prop2id",
                                                 ResourceIdPolicy.globalCreateOnly,
                                                 {}),
                    currentId: "prop2id",
                }
            }
        };
        const ids = getResourceIds(idList, state);
        should(ids).eql({
            prop1: "prop1id",
            prop2: "prop2id"
        });
    });

    it("Should error if no baseId", () => {
        const idList = resourceIdList("prop1");
        const props: ResourceIdProps<typeof idList> = {
            prop1: null
        };
        should(() => updateResourceIdState(idList, props, {}))
            .throwError(/one of baseId or defaultBaseId must be set/);
    });

    it("Should create initial ResourceId state", () => {
        const idList = resourceIdList("prop1", "prop2", "prop3");
        // NOTE: the following assignment also checks that type ResourceIdProps works correctly
        const props: ResourceIdProps<typeof idList> = {
            prop1: "prop1base",
            prop2: null,
            prop3: {
                baseId: "prop3base",
                policy: ResourceIdPolicy.globalCreateOnly,
            }
        };
        const options = {
            ...defaultIdOptions,
            defaultBaseId: "def"
        };

        const state = updateResourceIdState(idList, props, {},
                                            ResourceIdPolicy.local,
                                            { defaultBaseId: "def"});
        const replaced = replaceDynamicState(state);
        const expected: ResourceIdState<typeof idList> = {
            adaptResourceIds: {
                prop1: {
                    configured: {
                        baseId: "prop1base",
                        policy: ResourceIdPolicy.local,
                        options,
                    },
                    currentId: "prop1baseXXXXXXXX",
                },
                prop2: {
                    configured: {
                        baseId: null,
                        policy: ResourceIdPolicy.local,
                        options,
                    },
                    currentId: "defXXXXXXXX",
                },
                prop3: {
                    configured: {
                        baseId: "prop3base",
                        policy: ResourceIdPolicy.globalCreateOnly,
                        options,
                    },
                    currentId: "prop3base",
                },
            }
        };
        should(replaced).eql(expected);
    });

});
