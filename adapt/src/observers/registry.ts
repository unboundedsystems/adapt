import { MessageLogger, MessageStreamer } from "@usys/utils";
import * as ld from "lodash";
import * as util from "util";
import {
    createObserverManagerDeployment,
    ExecutedQuery,
    Observations,
    ObserverManagerDeployment,
} from "./obs_manager_deployment";
import {
    ObserverPlugin
} from "./plugin";

interface ObserverRecord {
    [name: string]: ObserverPlugin;
}

export interface ObserverNameHolder {
    observerName: string;
}

const observers: ObserverRecord = {};

export function makeObserverManagerDeployment(observations: Observations): ObserverManagerDeployment {
    const mgr = createObserverManagerDeployment();
    for (const name in observers) {
        if (!Object.hasOwnProperty.call(observers, name)) continue;
        const o = observers[name];
        const obs = observations[name];
        mgr.registerSchema({ observerName: name }, o.schema, obs ? obs.observations : {});
    }
    return mgr;
}

export function registerObserver(obs: ObserverPlugin, nameIn?: string): string {
    const constructor: { name: string, observerName?: string } = obs.constructor;
    const name = nameIn ? nameIn : constructor.name;

    //FIXME(manishv) Use reanimate library to get unique names and avoid conflicts
    if (name in observers) throw new Error(`Attempt to register observer with duplicate name '${name}'`);
    observers[name] = obs;

    if (constructor.observerName === undefined) constructor.observerName = name;
    return name;
}

export function findObserver(observer: ObserverNameHolder): ObserverPlugin | undefined {
    return observers[observer.observerName];
}

export async function observe(
    executedQueries: { [observerNames: string]: ExecutedQuery[] },
    logger: MessageLogger = new MessageStreamer("observe"), //Should bitbucket log messages
    observerNames: string[] = Object.keys(observers)): Promise<Observations> {

    const ret: Observations = {};
    const waitFors: Promise<void>[] = [];
    const errors: Error[] = [];
    for (const name of observerNames) {
        const obs = observers[name];
        if (obs === undefined) continue; //Should this be an error instead?
        const queries = executedQueries[name] ? executedQueries[name] : [];
        const waitP = (async () => {
            try {
                const observations = await obs.observe(queries);
                ret[name] = {
                    observations,
                    queries
                };
            } catch (e) {
                if (!ld.isError(e)) e = new Error(util.inspect(e));
                const msg = `Error observing for ${name}: ${e.message}`;
                logger.warning(msg);
                errors.push(new Error(msg));
            }
        })();
        waitFors.push(waitP);
    }

    await Promise.all(waitFors); //Should never throw/reject
    if (errors.length !== 0) {
        const msgs = errors.map((val) => val.message);
        const e: Error & { observations?: Observations } =
            new Error("Errors during observations:\n" + msgs.join("\n"));
        e.observations = ret; //Allow storage of partial results by returning them
        throw e;
    }

    return ret;
}
