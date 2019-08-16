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
import { BuildHelpers, isReady } from "../jsx";
import { useImperativeMethods } from "./imperative";

export function useReadyFrom(targetHand: Handle) {
    useImperativeMethods(() => ({
        ready: (helpers: BuildHelpers) => isReady(helpers, targetHand)
    }));
}
