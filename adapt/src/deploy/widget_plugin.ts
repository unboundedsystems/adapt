import { Logger } from "@usys/utils";
import stringify from "json-stable-stringify";
import { InternalError } from "../error";
import {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    isMountedElement,
} from "../jsx";
import {
    Action,
    ActionInfo,
    ChangeType,
    Plugin,
    PluginOptions,
} from "./deploy_types";

export interface WidgetPair<E extends AdaptElement, O extends object> {
    queryDomainKey: QueryDomainKey;
    actionInfo: ActionInfo;
    element?: E;
    observed?: O;
}

type WidgetActions<E extends AdaptElement, O extends object> =
    Record<ChangeType, WidgetPair<E, O>[]>;

export interface QueryDomain<Id, Secret> {
    id: Id;
    secret: Secret;
}
type QueryDomainKey = string;

export type WidgetId = string;

export interface WidgetChange<E extends AdaptElement> {
    id: WidgetId;
    from?: E;
    to?: E;
}

interface Expected<E extends AdaptElement> {
    [ queryDomainKey: string ]: WidgetChange<E>[];
}
export interface Observed<O extends object> {
    [ queryDomainKey: string ]: O[];
}

type GetId<T extends object> = (o: T) => WidgetId;

type ComputeChanges<E extends AdaptElement, O extends object> =
    (e: WidgetChange<E>, o: O | undefined) => ActionInfo;
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
    dataDir_?: string;
    queryDomains = new Map<QueryDomainKey, QDomain>();

    /*
     * Methods that each subclass is required to implement
     */

    findElems: (dom: AdaptElementOrNull) => WidgetElem[];
    getElemQueryDomain: (el: WidgetElem) => QDomain;
    getWidgetTypeFromElem: (el: WidgetElem) => string;
    getWidgetTypeFromObs: (obs: WidgetObs) => string;
    getWidgetIdFromElem: (el: WidgetElem) => WidgetId;
    getWidgetIdFromObs: (obs: WidgetObs) => WidgetId;
    computeChanges: ComputeChanges<WidgetElem, WidgetObs>;
    getObservations: (
        domain: QDomain,
        deployID: string,
        elemsInQDomain: WidgetChange<WidgetElem>[]) => Promise<WidgetObs[]>;

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
        this.dataDir_ = options.dataDir;
    }

    createExpected(
        oldDom: AdaptElementOrNull,
        newDom: AdaptElementOrNull,
        createQueryDomains = false): Expected<WidgetElem> {

        const ret: Expected<WidgetElem> = {};
        const changes = new Map<WidgetId, WidgetChange<WidgetElem>>();

        const addElems = (dom: AdaptElementOrNull, type: "from" | "to") => {
            this.findElems(dom).forEach((el) => {
                const id = this.getWidgetIdFromElem(el);
                let change = changes.get(id);
                if (change) {
                    change[type] = el;
                    return;
                }
                change = { id, [type]: el };
                changes.set(id, change);

                const domain = this.getElemQueryDomain(el);
                const qdKey = makeQueryDomainKey(domain);
                const qdChangeList = ret[qdKey] || [];
                ret[qdKey] = qdChangeList;
                qdChangeList.push(change);

                if (createQueryDomains && this.queryDomains.get(qdKey) == null) {
                    this.queryDomains.set(qdKey, domain);
                }
            });
        };

        addElems(oldDom, "from");
        addElems(newDom, "to");
        return ret;
    }

    async observe(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observed<WidgetObs>> {
        const elemsInQDomain = this.createExpected(oldDom, dom, true);

        const obs: Observed<WidgetObs> = {};
        for (const [ key, domain ] of this.queryDomains.entries()) {
            obs[key] = await this.getObservations(domain, this.deployID,
                                                  elemsInQDomain[key]);
        }
        return obs;
    }

    analyze(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observed<WidgetObs>): Action[] {
        const deployID = this.deployID;

        const expected = this.createExpected(oldDom, dom);
        const actions = diffObservations<WidgetElem, WidgetObs>(
            expected,
            obs,
            (o) => this.getWidgetIdFromObs(o),
            (el, o) => this.computeChanges(el, o)
        );
        const ret: Action[] = [];

        this.translatePairs(ret, actions.create, "Creating",
                            (d, p) => this.createWidget(d, deployID, p));
        this.translatePairs(ret, actions.modify, "Modifying",
                            (d, p) => this.modifyWidget(d, deployID, p));
        this.translatePairs(ret, actions.replace, "Replacing",
                            async (d, p) => {
                                await this.destroyWidget(d, deployID, p);
                                await this.createWidget(d, deployID, p);
                            });
        this.translatePairs(ret, actions.delete, "Destroying",
                            (d, p) => this.destroyWidget(d, deployID, p));
        this.translatePairs(ret, actions.none, "Not modifying", () => {/**/});
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

    get dataDir(): string {
        if (this.dataDir_ == null) {
            throw new Error(`Internal error: dataDir not initialized yet`);
        }
        return this.dataDir_;
    }

    log = (arg: any, ...args: any[]): void => {
        if (this.log_) this.log_(arg, ...args);
    }

    queryDomain(key: QueryDomainKey) {
        return this.queryDomains.get(key);
    }

    widgetInfo(pair: WidgetPair<WidgetElem, WidgetObs>) {
        let type: string;
        let id: WidgetId;
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
                ...p.actionInfo,
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
    expected: WidgetChange<E>[],
    observed: O[],
    observedId: GetId<O>,
    computeChanges: ComputeChanges<E, O>,
    actions: WidgetActions<E, O>,
): void {

    const obsMap = new Map(observed.map((o) => [observedId(o), o] as [string, O]));
    let actionInfo: ActionInfo;

    for (const e of expected) {
        const o = obsMap.get(e.id);
        if (o !== undefined) obsMap.delete(e.id);

        actionInfo = computeChanges(e, o);
        const pair = { queryDomainKey, actionInfo };
        const actionList = actions[actionInfo.type];
        switch (actionInfo.type) {
            case ChangeType.create:
            case ChangeType.none:
                actionList.push({...pair, element: e.to});
                break;
            case ChangeType.delete:
                actionList.push({...pair, observed: o});
                break;
            case ChangeType.modify:
            case ChangeType.replace:
                actionList.push({...pair, element: e.to, observed: o});
                break;
        }
    }

    for (const [id, o] of obsMap) {
        actionInfo = computeChanges({id}, o);
        actions.delete.push({queryDomainKey, actionInfo, observed: o});
    }
}

function diffObservations<E extends AdaptElement, O extends object>(
    expected: Expected<E>,
    observed: Observed<O>,
    observedId: GetId<O>,
    computeChanges: ComputeChanges<E, O>,
): WidgetActions<E, O> {
    const actions: WidgetActions<E, O> = {
        create: [],
        delete: [],
        modify: [],
        none: [],
        replace: [],
    };
    // Clone so we can modify
    observed = {...observed};

    for (const key of Object.keys(expected)) {
        diffArrays(key, expected[key], observed[key] || [],
                   observedId, computeChanges, actions);
        delete observed[key];
    }
    for (const key of Object.keys(observed)) {
        diffArrays(key, [], observed[key],
                   observedId, computeChanges, actions);
    }
    return actions;
}
