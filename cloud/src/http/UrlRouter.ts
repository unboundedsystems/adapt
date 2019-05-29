import { Handle, PrimitiveComponent } from "@usys/adapt";
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
