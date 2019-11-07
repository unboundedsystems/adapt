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

import { DeployedWhenMethod } from "../deploy";
import { GenericInstanceMethods } from "../jsx";
import { useImperativeMethods } from "./imperative";

/**
 * Options for the {@link useDeployedWhen} hook.
 * @public
 */
export interface UseDeployedWhenOptions {
    /**
     * This flag is a hint for user interfaces, such as the Adapt CLI. It
     * tells the user interface that this component's `deployedWhen` function
     * is "trivial" and therefore its status should not typically be shown in
     * user interfaces unless the user has requested more detailed status
     * information on all components, or if there's an active action for
     * the component.
     *
     * `trivial` should typically be set to `true` if the `deployedWhen`
     * function **only** depends on the status of other components and does
     * not have any additional conditions of its own.
     *
     * @defaultValue `false`
     *
     * @example
     * A component's `deployedWhen` function waits for its children to become
     * deployed, but doesn't have any other meaningful information to share.
     * In this case, the `trivial` flag should likely be set to `true`.
     *
     * @example
     * A component's `deployedWhen` function makes an HTTP connection to
     * an external API endpoint, checking to see if the API is up and
     * accepting queries.
     * In this case, the `trivial` flag should be `false` (default value).
     */
    trivial?: boolean;
}

/**
 * Hook for adding a custom `deployedWhen` method to a function component.
 *
 * @remarks
 * Adding a custom `deployedWhen` method to a component allows the component to
 * directly control when the component can be considered deployed.
 *
 * For more information on using `deployedWhen` methods, see
 * {@link Adapt.DeployedWhenMethod}.
 *
 * For components that do not add a custom `deployedWhen` method, the
 * default behavior is that a component becomes deployed when all of it's
 * successors and children have been deployed. See {@link defaultDeployedWhen}
 * for more information.
 * @public
 */
export function useDeployedWhen(deployedWhen: DeployedWhenMethod, options: UseDeployedWhenOptions = {}) {
    const methods: GenericInstanceMethods = { deployedWhen };
    if (options.trivial === true) methods.deployedWhenIsTrivial = true;

    useImperativeMethods(() => methods);
}
