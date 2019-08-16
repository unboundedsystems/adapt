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

import { Handle, PrimitiveComponent } from "@adpt/core";
import { URL } from "url";
import { isString } from "util";

export interface UrlRouterRoute {
    path: string;
    endpoint: Handle | string;
    upstreamPath?: string;
}

export interface UrlRouterProps {
    port: number;
    externalPort?: number;
    routes: UrlRouterRoute[];
}

export interface ResolvedRoute {
    path: string;
    upstreamPath: string;
    url: string;
}

export abstract class UrlRouter extends PrimitiveComponent<UrlRouterProps> {
    static defaultProps = {
        port: 80,
    };
}

export default UrlRouter;

export function checkUrlEndpoints(routes: UrlRouterRoute[]) {
    const errs: string[] = [];
    for (const route of routes) {
        const ep = route.endpoint;
        if (!isString(ep)) continue;
        try {
            new URL(ep);
        } catch (e) {
            errs.push(`Invalid endpoint URL for "${route.path}": ${ep} `);
            continue;
        }
    }
    if (errs.length !== 0) throw new Error(`Error in routes for UrlRouter: \n${errs.join("\n")} \n`);
}
