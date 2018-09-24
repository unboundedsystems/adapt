import { removeUndef } from "@usys/utils";
import * as ld from "lodash";
import { Observations } from "../observers";
import {
    prepareAllObservationsForJson,
    PreparedObservations,
    reconstituteAllObservations
} from "../observers/serialize";
import { PluginObservations } from "../plugin_support";

export interface FullObservations {
    plugin?: PluginObservations;
    observer?: Observations;
}

export interface PreparedFullObservations {
    plugin: PluginObservations;
    observer: PreparedObservations;
}

function isObject(x: unknown): x is object { return ld.isObject(x); }

export function hasPreparedFullObservationsShape(candidate: unknown): candidate is PreparedFullObservations {
    if (!isObject(candidate)) return false;
    const plugin = (candidate as any).plugin;
    const observer = (candidate as any).observer;
    if (plugin && !isObject(plugin)) return false;
    if (observer) return hasPreparedFullObservationsShape(observer);
    return true;
}

export function parseFullObservationsJson(json: string): FullObservations {
    const candidate: unknown = JSON.parse(json);
    if (!hasPreparedFullObservationsShape(candidate)) {
        if (!isObject(candidate)) throw new Error("Full observations is not an object");
        if ((candidate as any).observer) {
            reconstituteAllObservations((candidate as any).observer); //Should throw better error than below
        }
        throw new Error("Illegal shape for full observations"); //Otherwise generic error
    }
    const observer = candidate.observer ? reconstituteAllObservations(candidate.observer) : undefined;
    const plugin = candidate.plugin;
    return removeUndef({ plugin, observer });
}

export function stringifyFullObservations(observations: FullObservations) {
    const observer = observations.observer;
    const prepped = {
        plugin: observations.plugin,
        observer: observer ? prepareAllObservationsForJson(observer) : observer
    };
    return JSON.stringify(removeUndef(prepped));
}
