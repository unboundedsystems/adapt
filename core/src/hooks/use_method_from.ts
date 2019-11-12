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

import { Handle } from "../handle";
import { useImperativeMethods } from "./imperative";
import { callInstanceMethod } from "./use_method";

/**
 * Hook to create an imperative method for a component which forwards calls
 * to another component.
 *
 * @remarks
 *
 * Creates an imperative method named `methodName` on the component from which
 * this hook is invoked, which calls the imperative method of the same
 * name on the component instance referenced by `provider`.
 *
 * When this component's method `methodName` is called by another component,
 * typically via {@link useMethod}, if `provider` does not reference a valid
 * Element, `defaultVal` will be returned. If `methodName` does not exist on
 * `provider` or is not a function, an error will be thrown. Otherwise, the
 * provider Element's `methodName` method will be invoked and its return value
 * returned to the caller.
 *
 * @param provider - a {@link Handle} an Element that has method `methodName`. In
 * the case that `provider` is `null`, then `defaultVal` will be returned.
 *
 * @param methodName - The name that will be used for both the imperative
 * method created on the invoking component and that will be invoked on the
 * provider component.
 *
 * @param defaultVal - The value that will be returned if `provider` is null
 * or if `provider` does not reference an Element in the DOM at the time of
 * invocation.
 *
 * @public
 */
export function useMethodFrom(provider: Handle | null, methodName: string, defaultVal?: any) {
    useImperativeMethods(() => ({
        [methodName]: (...args: any[]) =>
            provider ? callInstanceMethod(provider, defaultVal, methodName, ...args) : defaultVal
    }));
}
