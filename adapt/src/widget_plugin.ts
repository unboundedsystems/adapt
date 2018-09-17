import * as stringify from "json-stable-stringify";
import {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    Logger,
    Plugin,
    PluginOptions,
} from ".";

export interface WidgetPair<E extends AdaptElement, O extends object> {
    queryDomainKey: QueryDomainKey;
    element?: E;
    observed?: O;
}

interface WidgetActions<E extends AdaptElement, O extends object> {
    toCreate: WidgetPair<E, O>[];
    toDestroy: WidgetPair<E, O>[];
    toModify: WidgetPair<E, O>[];
    toReplace: WidgetPair<E, O>[];
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
type TranslateAction<
    QD extends QueryDomain<any, any>,
    E extends AdaptElement,
    O extends object
    > = (d: QD, p: WidgetPair<E, O>) => void | Promise<void>;

export abstract class WidgetPlugin<
    Props extends object,
    Obs extends object,
    QDId,
    QDSecret,
> implements Plugin {

    deployID?: string;
    log_?: Logger;
    queryDomains = new Map<QueryDomainKey, QueryDomain<QDId, QDSecret>>();

    /*
     * Methods that each subclass is required to implement
     */

    findElems: (dom: AdaptElementOrNull) => AdaptElement<Props>[];
    getElemQueryDomain: (el: AdaptElement<Props>) => QueryDomain<QDId, QDSecret>;
    getObservations: (domain: QueryDomain<QDId, QDSecret>, deployID: string) => Promise<Obs[]>;
    getWidgetTypeFromElem: (el: AdaptElement<Props>) => string;
    getWidgetTypeFromObs: (obs: Obs) => string;
    getWidgetIdFromElem: (el: AdaptElement<Props>) => string;
    getWidgetIdFromObs: (obs: Obs) => string;
    needsUpdate: (el: AdaptElement<Props>, obs: Obs) => UpdateType;

    createWidget: (
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: WidgetPair<AdaptElement<Props>, Obs>) => Promise<void>;
    destroyWidget: (
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: WidgetPair<AdaptElement<Props>, Obs>) => Promise<void>;
    modifyWidget: (
        domain: QueryDomain<QDId, QDSecret>, deployID: string,
        resource: WidgetPair<AdaptElement<Props>, Obs>) => Promise<void>;

    /*
     * Methods that implement the Plugin interface
     */

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
            (el) => this.getWidgetIdFromElem(el),
            (o) => this.getWidgetIdFromObs(o),
            (el, o) => this.needsUpdate(el, o)
        );
        const ret: Action[] = [];

        this.translatePairs(ret, actions.toCreate, "Creating",
                            (d, p) => this.createWidget(d, deployID, p));
        this.translatePairs(ret, actions.toModify, "Modifying",
                            (d, p) => this.modifyWidget(d, deployID, p));
        this.translatePairs(ret, actions.toReplace, "Replacing",
                            async (d, p) => {
                                await this.destroyWidget(d, deployID, p);
                                await this.createWidget(d, deployID, p);
                            });
        this.translatePairs(ret, actions.toDestroy, "Destroying",
                            (d, p) => this.destroyWidget(d, deployID, p));
        return ret;
    }

    async finish() {
        this.log_ = undefined;
    }

    /*
     * Additional class methods
     */

    log(arg: any, ...args: any[]): void {
        if (this.log_) this.log_(arg, ...args);
    }

    queryDomain(key: QueryDomainKey) {
        return this.queryDomains.get(key);
    }

    getTypeAndId(pair: WidgetPair<AdaptElement<Props>, Obs>) {
        let type: string;
        let id: string;
        if (pair.element !== undefined) {
            type = this.getWidgetTypeFromElem(pair.element);
            id = this.getWidgetIdFromElem(pair.element);
        } else if (pair.observed !== undefined) {
            type = this.getWidgetTypeFromObs(pair.observed);
            id = this.getWidgetIdFromObs(pair.observed);
        } else {
            throw new Error(`Internal error: WidgetPair with no content`);
        }
        return { type, id };
    }

    /**
     * Translate WidgetPairs into plugin Actions
     */
    translatePairs(
        actions: Action[],
        pairs: WidgetPair<AdaptElement<Props>, Obs>[],
        actionType: string,
        action: TranslateAction<QueryDomain<QDId, QDSecret>, AdaptElement<Props>, Obs>
    ) {
        for (const p of pairs) {
            const { type, id } = this.getTypeAndId(p);
            const domain = this.queryDomain(p.queryDomainKey);
            if (domain == null) throw new Error(`Internal error: domain null`);
            actions.push({
                description: `${actionType} ${type} ${id}`,
                act: async () => action(domain, p),
            });
        }
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
    actions: WidgetActions<E, O>,
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
): WidgetActions<E, O> {
    const actions: WidgetActions<E, O> = {
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
