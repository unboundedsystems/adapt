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
import {
    AdaptMountedElement,
} from "../jsx";
import {
    Waiting,
} from "./deploy_types";
import {
    EPNode,
    EPNodeId,
} from "./deploy_types_private";

interface DeployedWhenQueueEntry {
    id: EPNodeId;
    node: EPNode;
    waitingOn: Set<AdaptMountedElement>;
}

/**
 * Keeps track of nodes for which the Element's deployedWhen method returned a
 * set of Handles that the Element is waiting on. As Handles become deployed,
 * it evaluates whether all of the mentioned Handles have now become deployed
 * and therefore the node might now be ready.
 */
export class DeployedWhenQueue {
    private queues = new Map<AdaptMountedElement, DeployedWhenQueueEntry[]>();

    constructor(private debugId: (id: string, ...args: any[]) => void) {}

    /**
     * Enqueue a node. Should only be called if the node's Element deployedWhen
     * returned a Waiting object. If no Handles are referenced in the Waiting
     * object(s), the node is not queued.
     */
    enqueue(node: EPNode, id: EPNodeId, wStat: Waiting | Waiting[]) {
        const waitingOn = new Set<AdaptMountedElement>();
        const entry = { id, node, waitingOn };

        function walk(ws: Waiting[]) {
            for (const w of ws) {
                for (const h of w.toDeploy || []) {
                    const el = h.mountedOrig;
                    if (el) waitingOn.add(el);
                }
                if (w.related) walk(w.related);
            }
        }

        walk(toArray(wStat));

        for (const el of waitingOn) {
            this.getQueue(el).push(entry);
        }
        if (waitingOn.size) this.debugId(id, `  Queueing--waiting on ${waitingOn.size} Elements`);
    }

    /**
     * Called to notify this DeployedWhenQueue that an Element has become
     * deployed. The callback is invoked once for each node that has now become
     * ready.
     */
    completed(el: AdaptMountedElement, cb: (n: EPNode) => void) {
        const q = this.queues.get(el);
        if (!q) return;
        this.queues.delete(el);

        for (const entry of q) {
            entry.waitingOn.delete(el);
            if (entry.waitingOn.size === 0) {
                this.debugId(entry.id, `  Dequeueing--no longer waiting on Elements`);
                cb(entry.node);
            }
        }
    }

    private getQueue(el: AdaptMountedElement) {
        let q = this.queues.get(el);
        if (!q) {
            q = [];
            this.queues.set(el, q);
        }
        return q;
    }
}
