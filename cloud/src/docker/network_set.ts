/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { toArray } from "@adpt/utils";
import { InspectReport } from "./cli";

/**
 * Representation of a Docker network name<->ID mapping.
 * @internal
 */
export interface NetworkInfo {
    name: string;
    id?: string;
}

/**
 * Representation of the differences between two sets of Docker networks, in
 * the form of what changes would need to be made to make them equivalent.
 * @internal
 */
export interface NetworkDiff {
    toAdd: string[];
    toDelete: string[];
}

export type NetworkResolver = (names: string[]) => Promise<Required<NetworkInfo>[]>;

/**
 * Data structure that represents a set of networks connected to a container,
 * Structured to minimize network inspect requests to the Docker daemon.
 * @remarks
 * Notes:
 * - Under load, Docker network inspect requests via CLI can take a second
 *   or more each.
 * - In many typical cases, such as when a container is already connected
 *   to the correct networks, the container's InspectReport contains both the
 *   network name and ID for all networks we care about comparing, so no
 *   network inspect requests at all are needed.
 * - Most of the complexity in this implementation comes from the corner
 *   cases.
 * - Corner case 1: sometimes the NetworkID field is blank in the container
 *   InspectReport.
 * - Corner case 2: it's possible for the Element's props to have both the
 *   network name and the network ID for the same network, so simple length
 *   comparisons are not possible.
 * @internal
 */
export class NetworkSet {
    byName = new Map<string, NetworkInfo>();
    byId = new Map<string, NetworkInfo>();
    unresolved = new Set<string>();

    constructor(nets: NetworkInfo[] = []) {
        this.add(nets);
    }

    get size() { return this.byName.size; }

    /**
     * Returns true if all networks we know have both a name and ID.
     */
    get allResolved() { return this.unresolved.size === 0; }

    add(items: NetworkInfo | NetworkInfo[]) {
        toArray(items).forEach((i) => this._addOne(i));
    }

    async equals(namesOrIds: string[], resolver: NetworkResolver): Promise<boolean> {
        // Quick decision if there are more networks in our set than in the
        // comparison set. The reason this isn't returning false for
        // this.size < namesOrIds.length is because two entries in namesOrIds
        // could correspond to the same network (both the net name and the ID
        // are in the list).
        if (this.size > namesOrIds.length) return false;

        const ret = await this.diff(namesOrIds, resolver);

        return ret.toAdd.length === 0 && ret.toDelete.length === 0;
    }

    async diff(namesOrIds: string[], resolver: NetworkResolver): Promise<NetworkDiff> {
        let ret = this._diff(namesOrIds);
        if (ret) return ret;

        const resolved = await resolver([ ...this.unresolved ]);
        resolved.forEach((r) => this.add(r));

        ret = this._diff(namesOrIds);
        if (ret) return ret;

        throw new Error(`Resolution failed for Docker networks: ` +
            [...this.unresolved].join(", "));
    }

    _diff(namesOrIds: string[]): NetworkDiff | false {
        const toAdd = new Set<string>();
        const toDelete = new Set<string>([ ...this.byName.keys() ]);

        for (const n of namesOrIds) {
            const net = this._get(n);
            if (!net) {
                if (!this.allResolved && mightBeId(n)) {
                    // We can't decide this one without resolving.
                    return false;
                }
                toAdd.add(n);
            } else {
                toDelete.delete(net.name);
            }
        }

        return { toAdd: [ ...toAdd ], toDelete: [ ...toDelete ] };
    }

    _addOne(item: NetworkInfo) {
        const exist = this.byName.get(item.name);
        if (!exist) {
            this.byName.set(item.name, item);
            if (item.id) this.byId.set(item.id, item);
            else this.unresolved.add(item.name);
            return;
        }

        const oldId = exist.id;
        const newId = item.id;
        if (oldId === newId || !newId) return; // no update
        if (oldId) this.byId.delete(oldId);
        exist.id = newId;
        this.byId.set(newId, exist);
        this.unresolved.delete(exist.name);
    }

    _get(nameOrId: string) {
        return this.byName.get(nameOrId) || this.byId.get(nameOrId);
    }
}

/**
 * Returns a `NetworkSet` that represents the networks currently attached
 * to the container.
 * @internal
 */
export function containerNetworks(info: InspectReport) {
    const netObj = info.NetworkSettings.Networks || {};
    const nets = Object.keys(netObj).map((name) => {
        const net: NetworkInfo = { name };
        const id = netObj[name].NetworkID;
        if (id) net.id = id;
        return net;
    });
    return new NetworkSet(nets);
}

const idRegex = /^[a-f0-9]+$/;

/**
 * Returns true if there's a possibility this could reference a Docker
 * network ID.
 * @remarks
 * The Docker daemon will accept any portion of a partial network ID, as
 * long as it is not ambiguous **at that moment**, based on all existing
 * network IDs.
 * That means that lots of things can be a network ID, even a single character.
 * It could be an ID if it's:
 * - Made up of (only) lower case letters a-f and digits
 * - Length 1-64 characters
 * @internal
 */
export function mightBeId(name: string) {
    if (name.length < 1 || name.length > 64) return false;
    return idRegex.test(name);
}
