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
    element?: E;
    observed?: O;
}

interface Actions<E extends AdaptElement, O extends object> {
    toCreate: ResourcePair<E, O>[];
    toDestroy: ResourcePair<E, O>[];
    toUpdate: ResourcePair<E, O>[];
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
type NeedsUpdate<E extends AdaptElement, O extends object> = (e: E, o: O) => boolean;

export abstract class GenericPlugin<
    Props extends object,
    Obs extends object,
    QDId,
    QDSecret,
> implements Plugin {

    deployID?: string;
    log_?: Logger;

    abstract findElems(dom: AdaptElementOrNull): AdaptElement<Props>[];
    abstract getQueryDomain(el: AdaptElement<Props>): QueryDomain<QDId, QDSecret>;
    abstract getObservations(domain: QueryDomain<QDId, QDSecret>, deployID: string): Promise<Obs[]>;
    abstract getObservationType(obs: Obs): string;
    abstract getObservationId(obs: Obs): string;
    abstract getElemType(el: AdaptElement<Props>): string;
    abstract getElemId(el: AdaptElement<Props>): string;
    abstract needsUpdate(el: AdaptElement<Props>, obs: Obs): boolean;
    abstract createResource(deployID: string,
        resource: ResourcePair<AdaptElement<Props>, Obs>): Promise<void>;
    abstract destroyResource(deployID: string,
        resource: ResourcePair<AdaptElement<Props>, Obs>): Promise<void>;
    abstract updateResource(deployID: string,
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
            const domain = this.getQueryDomain(el);
            const key = queryDomainKey(domain);
            // Only query each domain once
            if (obs[key] !== undefined) continue;
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
            const key = queryDomainKey(this.getQueryDomain(e));
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
            ret.push({
                description: `Creating ${type} ${id}`,
                act: async () => this.createResource(deployID, a)
            });
        }
        for (const a of actions.toUpdate) {
            if (!a.element) throw new Error(`Internal error: element null`);
            const type = this.getElemType(a.element);
            const id = this.getElemId(a.element);
            ret.push({
                description: `Updating ${type} ${id}`,
                act: async () => this.updateResource(deployID, a)
            });
        }
        for (const a of actions.toDestroy) {
            if (!a.observed) throw new Error(`Internal error: observed null`);
            const type = this.getObservationType(a.observed);
            const id = this.getObservationId(a.observed);
            ret.push({
                description: `Destroying ${type} ${id}`,
                act: async () => this.destroyResource(deployID, a)
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
}

function queryDomainKey(queryDomain: QueryDomain<any, any>): QueryDomainKey {
    return stringify(queryDomain.id);
}

function diffArrays<E extends AdaptElement, O extends object>(
    expected: E[],
    observed: O[],
    expectedId: GetId<E>,
    observedId: GetId<O>,
    needsUpdate: NeedsUpdate<E, O>,
    toCreate: ResourcePair<E, O>[] = [],
    toDestroy: ResourcePair<E, O>[] = [],
    toUpdate: ResourcePair<E, O>[] = [],
): void {

    const obsMap = new Map(observed.map((o) => [observedId(o), o] as [string, O]));

    for (const e of expected) {
        const eId = expectedId(e);
        const o = obsMap.get(eId);
        if (o === undefined) {
            toCreate.push({element: e});
            continue;
        }
        obsMap.delete(eId);
        if (needsUpdate(e, o)) toUpdate.push({element: e, observed: o});
    }

    for (const entry of obsMap) {
        toDestroy.push({observed: entry[1]});
    }
}

function diffObservations<E extends AdaptElement, O extends object>(
    expected: Expected<E>,
    observed: Observed<O>,
    expectedId: GetId<E>,
    observedId: GetId<O>,
    needsUpdate: NeedsUpdate<E, O>,
): Actions<E, O> {
    const toCreate: ResourcePair<E, O>[] = [];
    const toDestroy: ResourcePair<E, O>[] = [];
    const toUpdate: ResourcePair<E, O>[] = [];
    // Clone so we can modify
    observed = {...observed};

    for (const key of Object.keys(expected)) {
        diffArrays(expected[key], observed[key] || [], expectedId, observedId,
            needsUpdate, toCreate, toDestroy, toUpdate);
        delete observed[key];
    }
    for (const key of Object.keys(observed)) {
        diffArrays([], observed[key], expectedId, observedId,
            needsUpdate, toCreate, toDestroy, toUpdate);
    }
    return { toCreate, toDestroy, toUpdate };
}
