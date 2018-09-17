import { tuple, TupleToUnion } from "@usys/utils";
import { isEqual, isNull } from "lodash";
import * as randomstring from "randomstring";
import { RequiredDeepT } from "type-ops";

export enum ResourceIdPolicy {
    local = "local",
    default = "local",
    globalCreateOnly = "globalCreateOnly",
    globalUseOnly = "globalUseOnly",
    globalCreateOrUse = "globalCreateOrUse",
}

export interface ResourceIdOptions {
    defaultBaseId?: ResourceIdBase;
    maxIdLength?: number | null;
    randLength?: number;
    separator?: string;
}

export type ResourceIdBase = string | null;

export interface ResourceId {
    baseId: ResourceIdBase;
    policy?: ResourceIdPolicy;
    options?: ResourceIdOptions;
}

function isResourceId(val: any): val is ResourceId {
    if (val == null || typeof val !== "object") return false;

    if (val.baseId !== null && typeof val.baseId !== "string") return false;
    if ("policy" in val && typeof val.policy !== "string") return false;
    if ("options" in val && typeof val.options !== "object") return false;

    for (const k of Object.keys(val)) {
        switch (k) {
            case "baseId":
            case "policy":
            case "options":
                continue;
            default:
                return false;
        }
    }
    return true;
}

export type ResourceIdConfig = RequiredDeepT<ResourceId>;
export type ResourceIdList = string[];

/**
 * Creates a tuple of the names of a set of properties. This can then be used
 * subsequently for both static type operations and runtime manipulation.
 *
 * @param idPropNames The string literal names of object properties that
 * should be ResourceIds.
 */
export function resourceIdList<T extends ResourceIdList>(...idPropNames: T): T {
    return tuple(...idPropNames);
}

/**
 * Given a tuple type (generated using typeof on the object returned by
 * resourceIdList), returns an object type that can be added to a
 * component's Props where all the properties for
 * keys specified in the resourceIdList have the correct type.
 * Currently that type is (ResourceId | string | null).
 */
export type ResourceIdProps<IdListType extends ResourceIdList> =
    Record<TupleToUnion<IdListType>, ResourceId | ResourceIdBase>;

/**
 * Given a ResourceIdList type, returns an object type where all of the
 * property names specified in resourceIdList have type string.
 */
export type ResourceIdStringProps<IdListType extends ResourceIdList> =
    Record<TupleToUnion<IdListType>, string>;

/**
 * Given a tuple type (see above), returns an object type that can be
 * added to a component's state object to keep track of any dynamically
 * generated ResourceId names.
 */
export interface ResourceIdState<IdListType extends ResourceIdList> {
    adaptResourceIds?: Record<TupleToUnion<IdListType>, StateEntry>;
}

export function idToString(config: ResourceIdConfig) {
    const { baseId, options, policy } = config;
    let base = baseId;
    let rand = "";
    let sep = "";

    if (base == null) base = options.defaultBaseId;
    if (base == null) {
        throw new Error(`ResourceId: one of baseId or defaultBaseId must be set`);
    }

    if (policy === ResourceIdPolicy.local) {
        rand = randomstring.generate({
            length: options.randLength,
            charset: "alphabetic",
            readable: true,
            capitalization: "lowercase",
        });
        sep = options.separator;
    }

    if (options.maxIdLength) {
        base = base.substring(0, options.maxIdLength - sep.length - rand.length);
    }
    return base + sep + rand;
}

const defaultIdOptions: Readonly<Required<ResourceIdOptions>> = Object.freeze({
    defaultBaseId: null,
    maxIdLength: null,
    // randomstring uses 8 bits of entropy from crypto.randomBytes (which
    // uses the system's strong PRNG e.g. /dev/random) to select each character,
    // so entropy is actually constrained by the character set used.
    // With randLength=8, and lower case alphabetic, the probability of
    // collision of names is 1 in 26^8 or about 208 trillion.
    randLength: 8,
    separator: "",
});

export function resourceIdConfig(
    id: ResourceId | string | null,
    policy: ResourceIdPolicy,
    options: ResourceIdOptions,
): ResourceIdConfig;
export function resourceIdConfig(
    id: unknown,
    policy: ResourceIdPolicy,
    options: ResourceIdOptions,
): undefined;
export function resourceIdConfig(
    id: unknown,
    policy: ResourceIdPolicy,
    options: ResourceIdOptions,
): ResourceIdConfig | undefined {
    if (isResourceId(id)) {
        return {
            baseId: id.baseId,
            options: { ...defaultIdOptions, ...options, ...id.options },
            policy: id.policy || policy,
        };
    }
    if (isNull(id) || typeof id === "string") {
        return {
            baseId: id,
            options: { ...defaultIdOptions, ...options },
            policy
        };
    }
    return undefined;
}

export interface StateWithResourceIds<Keys extends string = string> {
    adaptResourceIds: StateEntries<Keys>;
}

export interface StateEntry {
    configured: ResourceIdConfig;
    currentId: string;
}

type StateEntries<Keys extends string = string> = Record<Keys, StateEntry>;
type GetResourceIdKeys<State extends object> =
    State extends Partial<StateWithResourceIds<infer Ids>> ? Ids : never;

export function updateResourceIdState<
    State extends Partial<StateWithResourceIds>,
    IdList extends GetResourceIdKeys<State>[],
    Props extends ResourceIdProps<IdList>,
>(
    idList: IdList,
    props: Props,
    state: State,
    policy = ResourceIdPolicy.default,
    options: ResourceIdOptions = {}
): StateWithResourceIds<GetResourceIdKeys<State>> {
    type Entries = StateEntries<GetResourceIdKeys<State>>;
    // tslint:disable-next-line:no-object-literal-type-assertion
    const currentIds: Entries = (state.adaptResourceIds || {}) as any;
    // tslint:disable-next-line:no-object-literal-type-assertion
    const updated: StateEntries<GetResourceIdKeys<State>> = {} as any;

    for (const k of idList) {
        const current = currentIds[k];
        const newConfig = resourceIdConfig(props[k], policy, options);

        if (newConfig === undefined) continue;

        // If the configuration hasn't changed and we already have an ID,
        // then no change for this ID
        if (current != null &&
            (typeof current.currentId === "string") &&
            isEqual(current.configured, newConfig)) {
            updated[k] = current;
        } else {
            updated[k] = {
                configured: newConfig,
                currentId: idToString(newConfig),
            };
        }
    }

    return { adaptResourceIds: updated };
}

export function getResourceIds<
    State extends Partial<StateWithResourceIds>,
    IdList extends GetResourceIdKeys<State>[]>(
    idList: IdList,
    state: State
): Record<GetResourceIdKeys<State>, string> | undefined {

    const currentIds = state.adaptResourceIds;
    if (currentIds == null) return undefined;

    // tslint:disable-next-line:no-object-literal-type-assertion
    const ret = {} as Record<GetResourceIdKeys<State>, string>;
    for (const key of idList) {
        ret[key] = currentIds[key].currentId;
    }
    return ret;
}
