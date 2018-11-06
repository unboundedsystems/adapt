import * as stringify from "json-stable-stringify";
import {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    isMountedElement,
    Logger,
    Plugin,
    PluginOptions,
} from ".";
import { InternalError } from "./error";

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
    WidgetElem extends AdaptElement,
    WidgetObs extends object,
    QDomain extends QueryDomain<any, any>,
> implements Plugin<Observed<WidgetObs>> {

    deployID_?: string;
    log_?: Logger;
    queryDomains = new Map<QueryDomainKey, QDomain>();

    /*
     * Methods that each subclass is required to implement
     */

    findElems: (dom: AdaptElementOrNull) => WidgetElem[];
    getElemQueryDomain: (el: WidgetElem) => QDomain;
    getWidgetTypeFromElem: (el: WidgetElem) => string;
    getWidgetTypeFromObs: (obs: WidgetObs) => string;
    getWidgetIdFromElem: (el: WidgetElem) => string;
    getWidgetIdFromObs: (obs: WidgetObs) => string;
    needsUpdate: (el: WidgetElem, obs: WidgetObs) => UpdateType;
    getObservations: (
        domain: QDomain,
        deployID: string,
        elemsInQDomain: WidgetElem[]) => Promise<WidgetObs[]>;

    createWidget: (
        domain: QDomain, deployID: string,
        resource: WidgetPair<WidgetElem, WidgetObs>) => Promise<void>;
    destroyWidget: (
        domain: QDomain, deployID: string,
        resource: WidgetPair<WidgetElem, WidgetObs>) => Promise<void>;
    modifyWidget: (
        domain: QDomain, deployID: string,
        resource: WidgetPair<WidgetElem, WidgetObs>) => Promise<void>;

    /*
     * Methods that implement the Plugin interface
     */

    async start(options: PluginOptions) {
        this.deployID_ = options.deployID;
        this.log_ = options.log;
    }

    async observe(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observed<WidgetObs>> {
        let elems = this.findElems(dom);
        elems = elems.concat(this.findElems(oldDom));

        const elemsInQDomain: Expected<WidgetElem> = {};
        for (const el of elems) {
            const domain = this.getElemQueryDomain(el);
            const key = makeQueryDomainKey(domain);
            let list = elemsInQDomain[key];
            if (list == null) {
                list = [];
                elemsInQDomain[key] = list;
            }
            list.push(el);

            if (this.queryDomains.get(key) == null) {
                this.queryDomains.set(key, domain);
            }
        }

        const obs: Observed<WidgetObs> = {};
        for (const [ key, domain ] of this.queryDomains.entries()) {
            obs[key] = await this.getObservations(domain, this.deployID,
                                                  elemsInQDomain[key]);
        }
        return obs;
    }

    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observed<WidgetObs>): Action[] {
        const deployID = this.deployID;
        const elems = this.findElems(dom);

        const expected: Expected<WidgetElem> = {};
        for (const e of elems) {
            const key = makeQueryDomainKey(this.getElemQueryDomain(e));
            if (expected[key] == null) expected[key] = [];
            expected[key].push(e);
        }

        const actions = diffObservations<WidgetElem, WidgetObs>(
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

    get deployID(): string {
        if (this.deployID_ == null) {
            throw new InternalError(`deployID not initialized yet`);
        }
        return this.deployID_;
    }

    log = (arg: any, ...args: any[]): void => {
        if (this.log_) this.log_(arg, ...args);
    }

    queryDomain(key: QueryDomainKey) {
        return this.queryDomains.get(key);
    }

    widgetInfo(pair: WidgetPair<WidgetElem, WidgetObs>) {
        let type: string;
        let id: string;
        let key: string | undefined;
        const el = pair.element;
        if (el != null) {
            if (!isMountedElement(el)) throw new InternalError(`element not mounted`);
            type = this.getWidgetTypeFromElem(el);
            id = this.getWidgetIdFromElem(el);
            key = el.props.key;
        } else if (pair.observed !== undefined) {
            type = this.getWidgetTypeFromObs(pair.observed);
            id = this.getWidgetIdFromObs(pair.observed);
        } else {
            throw new InternalError(`WidgetPair with no content`);
        }
        return { type, id, key };
    }

    /**
     * Translate WidgetPairs into plugin Actions
     */
    translatePairs(
        actions: Action[],
        pairs: WidgetPair<WidgetElem, WidgetObs>[],
        actionType: string,
        action: TranslateAction<QDomain, WidgetElem, WidgetObs>
    ) {
        for (const p of pairs) {
            const { type, id, key } = this.widgetInfo(p);
            const k = key ? ` '${key}'` : "";
            const description = `${actionType} ${type}${k} (id=${id})`;

            const domain = this.queryDomain(p.queryDomainKey);
            if (domain == null) throw new InternalError(`domain null`);
            actions.push({
                description,
                act: async () => {
                    try {
                        await action(domain, p);
                    } catch (err) {
                        const path = p.element ? getPath(p.element) : "";
                        throw new Error(
                            `An error occurred while ${description}` +
                            `${path}: ${err.message || err}`);

                    }
                }
            });
        }
    }

}

function getPath(el: AdaptElement<AnyProps>): string {
    if (isMountedElement(el)) return ` [${el.path}]`;
    return "";
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
