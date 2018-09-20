import { MessageStreamer } from "@usys/utils";
import * as ld from "lodash";
import * as util from "util";
import {
    createObserverManagerDeployment,
    ExecutedQuery,
    Observations,
    Observer,
    ObserverManagerDeployment
} from ".";
import { MessageLogger } from "..";

interface ObserverRecord {
    [name: string]: Observer;
}

const observers: ObserverRecord = {};

export function makeObserverManagerDeployment(observations: Observations): ObserverManagerDeployment {
    const mgr = createObserverManagerDeployment();
    for (const name in observers) {
        if (!Object.hasOwnProperty.apply(observers, name)) continue;
        const o = observers[name];
        const obs = observations[name].observations;
        mgr.registerSchema(name, o.schema, obs ? obs : {});
    }
    return mgr;
}

export function registerObserver(name: string, obs: Observer): string {
    //FIXME(manishv) Use reanimate library to get unique names and avoid conflicts
    if (name in observers) throw new Error("Attempt to register observer with duplicate name");
    observers[name] = obs;
    return name;
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
                const observations = await obs.observe(obs.schema, queries);
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
