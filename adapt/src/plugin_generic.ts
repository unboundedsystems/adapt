import * as stringify from "json-stable-stringify";
import {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    Logger,
    Plugin,
    PluginOptions,
} from ".";

export interface ResourcePair<E extends AdaptElement, O extends object> {
    queryDomainKey: QueryDomainKey;
    element?: E;
    observed?: O;
}

interface Actions<E extends AdaptElement, O extends object> {
    toCreate: ResourcePair<E, O>[];
    toDestroy: ResourcePair<E, O>[];
    toModify: ResourcePair<E, O>[];
    toReplace: ResourcePair<E, O>[];
}

export interface QueryDomain<Id, Secret> {
    id: Id;
    secret: Secret;
}
type QueryDomainKey = string;

interface Expected<E extends AdaptElement> {
    [ queryDomainKey: string ]: E[];
}
interface Observed<O extends object> {
    [ queryDomainKey: string ]: O[];
}

type GetId<T extends object> = (o: T) => string;

export enum UpdateType {
    none = "none",
    modify = "modify",
    replace = "replace",
}
type NeedsUpdate<E extends AdaptElement, O extends object> = (e: E, o: O) => UpdateType;

export abstract class GenericPlugin<
    Props extends object,
    Obs extends object,
    QDId,
    QDSecret,
> implements Plugin {

    deployID?: string;
    log_?: Logger;
    queryDomains = new Map<QueryDomainKey, QueryDomain<QDId, QDSecret>>();

    abstract findElems(dom: AdaptElementOrNull): AdaptElement<Props>[];
    abstract getElemQueryDomain(el: AdaptElement<Props>): QueryDomain<QDId, QDSecret>;
    abstract getObservations(domain: QueryDomain<QDId, QDSecret>, deployID: string): Promise<Obs[]>;
    abstract getObservationType(obs: Obs): string;
    abstract getObservationId(obs: Obs): string;
    abstract getElemType(el: AdaptElement<Props>): string;
    abstract getElemId(el: AdaptElement<Props>): string;
    abstract needsUpdate(el: AdaptElement<Props>, obs: Obs): UpdateType;

    abstract createResource(
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: ResourcePair<AdaptElement<Props>, Obs>): Promise<void>;
    abstract destroyResource(
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: ResourcePair<AdaptElement<Props>, Obs>): Promise<void>;
    abstract updateResource(
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: ResourcePair<AdaptElement<Props>, Obs>): Promise<void>;

    async start(options: PluginOptions) {
        this.deployID = options.deployID;
        this.log_ = options.log;
    }

    async observe(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observed<Obs>> {
        if (!this.deployID) throw new Error(`Cannot call observe before start`);

        let elems = this.findElems(dom);
        elems = elems.concat(this.findElems(oldDom));

        const obs: Observed<Obs> = {};
        for (const el of elems) {
            const domain = this.getElemQueryDomain(el);
            const key = makeQueryDomainKey(domain);
            // Only query each domain once
            if (obs[key] !== undefined) continue;
            this.queryDomains.set(key, domain);
            obs[key] = await this.getObservations(domain, this.deployID);
        }
        return obs;
    }

    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observed<Obs>): Action[] {
        const deployID = this.deployID;
        if (!deployID) throw new Error(`Cannot call observe before start`);

        const elems = this.findElems(dom);

        const expected: Expected<AdaptElement<Props>> = {};
        for (const e of elems) {
            const key = makeQueryDomainKey(this.getElemQueryDomain(e));
            if (expected[key] == null) expected[key] = [];
            expected[key].push(e);
        }

        const actions = diffObservations<AdaptElement<Props>, Obs>(
            expected,
            obs,
            (el) => this.getElemId(el),
            (o) => this.getObservationId(o),
            (el, o) => this.needsUpdate(el, o)
        );
        const ret: Action[] = [];

        for (const a of actions.toCreate) {
            if (!a.element) throw new Error(`Internal error: element null`);
            const type = this.getElemType(a.element);
            const id = this.getElemId(a.element);
            const domain = this.queryDomain(a.queryDomainKey);
            if (domain == null) throw new Error(`Internal error: domain null`);
            ret.push({
                description: `Creating ${type} ${id}`,
                act: async () => this.createResource(domain, deployID, a)
            });
        }
        for (const a of actions.toModify) {
            if (!a.element) throw new Error(`Internal error: element null`);
            const type = this.getElemType(a.element);
            const id = this.getElemId(a.element);
            const domain = this.queryDomain(a.queryDomainKey);
            if (domain == null) throw new Error(`Internal error: domain null`);
            ret.push({
                description: `Modifying ${type} ${id}`,
                act: async () => this.updateResource(domain, deployID, a)
            });
        }
        for (const a of actions.toReplace) {
            if (!a.element) throw new Error(`Internal error: element null`);
            const type = this.getElemType(a.element);
            const id = this.getElemId(a.element);
            const domain = this.queryDomain(a.queryDomainKey);
            if (domain == null) throw new Error(`Internal error: domain null`);
            ret.push({
                description: `Replacing ${type} ${id}`,
                act: async () => {
                    await this.destroyResource(domain, deployID, a);
                    await this.createResource(domain, deployID, a);
                }
            });
        }
        for (const a of actions.toDestroy) {
            if (!a.observed) throw new Error(`Internal error: observed null`);
            const type = this.getObservationType(a.observed);
            const id = this.getObservationId(a.observed);
            const domain = this.queryDomain(a.queryDomainKey);
            if (domain == null) throw new Error(`Internal error: domain null`);
            ret.push({
                description: `Destroying ${type} ${id}`,
                act: async () => this.destroyResource(domain, deployID, a)
            });
        }

        return ret;
    }

    async finish() {
        this.log_ = undefined;
    }

    log(arg: any, ...args: any[]): void {
        if (this.log_) this.log_(arg, ...args);
    }

    queryDomain(key: QueryDomainKey) {
        return this.queryDomains.get(key);
    }
}

function makeQueryDomainKey(queryDomain: QueryDomain<any, any>): QueryDomainKey {
    return stringify(queryDomain.id);
}

function diffArrays<E extends AdaptElement, O extends object>(
    queryDomainKey: QueryDomainKey,
    expected: E[],
    observed: O[],
    expectedId: GetId<E>,
    observedId: GetId<O>,
    needsUpdate: NeedsUpdate<E, O>,
    actions: Actions<E, O>,
): void {

    const obsMap = new Map(observed.map((o) => [observedId(o), o] as [string, O]));

    for (const e of expected) {
        const eId = expectedId(e);
        const o = obsMap.get(eId);
        if (o === undefined) {
            actions.toCreate.push({queryDomainKey, element: e});
            continue;
        }
        obsMap.delete(eId);
        switch (needsUpdate(e, o)) {
            case UpdateType.modify:
                actions.toModify.push({queryDomainKey, element: e, observed: o});
                break;
            case UpdateType.replace:
                actions.toReplace.push({queryDomainKey, element: e, observed: o});
                break;
            case UpdateType.none:
                break;
        }
    }

    for (const entry of obsMap) {
        actions.toDestroy.push({queryDomainKey, observed: entry[1]});
    }
}

function diffObservations<E extends AdaptElement, O extends object>(
    expected: Expected<E>,
    observed: Observed<O>,
    expectedId: GetId<E>,
    observedId: GetId<O>,
    needsUpdate: NeedsUpdate<E, O>,
): Actions<E, O> {
    const actions: Actions<E, O> = {
        toCreate: [],
        toDestroy: [],
        toModify: [],
        toReplace: [],
    };
    // Clone so we can modify
    observed = {...observed};

    for (const key of Object.keys(expected)) {
        diffArrays(key, expected[key], observed[key] || [], expectedId,
                   observedId, needsUpdate, actions);
        delete observed[key];
    }
    for (const key of Object.keys(observed)) {
        diffArrays(key, [], observed[key], expectedId, observedId,
                   needsUpdate, actions);
    }
    return actions;
}
