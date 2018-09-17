import { createObserverManagerDeployment, Observations, Observer, ObserverManagerDeployment } from ".";

interface ObserverRecord {
    [name: string]: Observer;
}

const observers: ObserverRecord = {};

export function makeObserverManagerDeployment(observations: Observations): ObserverManagerDeployment {
    const mgr = createObserverManagerDeployment();
    for (const name in observers) {
        if (!Object.hasOwnProperty.apply(observers, name)) continue;
        const o = observers[name];
        const obs = observations[name];
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
