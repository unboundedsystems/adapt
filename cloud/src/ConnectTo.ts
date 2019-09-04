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

import { callInstanceMethod, Handle, useAsync } from "@adpt/core";
import { toArray } from "@adpt/utils";
import { Environment, mergeEnvPairs } from "./env";

/**
 * Components that provide a service, such as a database service or API
 * service, can implement this interface in order to supply all the information
 * required to connect to the service.
 *
 * @remarks
 * Currently, the only method supported for providing connection information
 * is via environment variables. However, additional formats for providing
 * connection information will be added as needs arise.
 * @public
 */
export interface ConnectToInstance {
    /**
     * Supplies the set of environment variables that have all the information
     * needed for a consumer of a service to connect to the provider.
     *
     * @remarks
     * This may include information like network hostname(s), port(s),
     * credentials, namespace, or any other service-specific information.
     *
     * In cases where the service has not been deployed yet or the
     * connection information is not yet available for any reason, the
     * method will return `undefined`.
     *
     * Providers are discouraged from using environment variable names
     * that are too generic or are likely to conflict with other environment
     * variables that may already be in use. For example, avoid names like
     * `HOST` and `USERNAME`. Instead, use names that are likely to be
     * unique to the type of service so that a consumer can
     * use more than one type of service without causing naming conflicts.
     *
     * Providers are encouraged to use environment variable names that are
     * typically used by consumers of the service. For example, the provider
     * of a Postgres database service should use the names `PGHOST` and
     * `PGUSER`, which are defined in the Postgres documentation and
     * are typically supported by most Postgres database clients.
     *
     * Providers should never return partial information. Return `undefined`
     * until all required connection information is available.
     */
    connectEnv(): Environment | undefined;
}

/**
 * Hook that will build an {@link Environment} object from components that comply with {@link ConnectToInstance}
 *
 * @param connectTo - A handle or array of handles that point to components that implement {@link ConnectToInstance}
 * @param xform - A method that can transform the provided environment before it is returned
 * @returns Merged {@link Environment} with variables provided by `connectTo` components, or undefined
 *
 * @remarks
 * Note that this is a hook, and so on first run this will return undefined.
 * After a full build, a state update will trigger a rebuild, at which point
 * the returned Environment will begin to be populated with the variables as
 * the various components are ready to provide them.  However, it can take multiple
 * turns of the build-deploy loop to get all the variables.
 *
 * Moreover, just because a component returns connection information in a variable
 * does not mean it is ready to accept traffic at that time.  Components that use this
 * hook to get connection information for other services must be prepared for those
 * services to be temporarily unavailable.
 *
 * See {@link renameEnvVars} as a function that is useful as an `xform` argument.
 *
 * @public
 */
export function useConnectTo(connectTo: Handle | Handle[],
    xform?: (e: Environment | undefined) => Environment): Environment | undefined {
    const lxform = xform || ((x) => x);
    const connectEnvs = useAsync<(Environment | undefined)[]>(() =>
        toArray(connectTo)
            .map((h) => lxform(callInstanceMethod(h, undefined, "connectEnv"))), []);
    return mergeEnvPairs(...connectEnvs);
}
