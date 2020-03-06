/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { isUserError } from "@adpt/utils";
import { Hook } from "@oclif/config";
import { createConfig } from "./load";

const hook: Hook<"init"> = async function (options) {
    try {
        await createConfig(options.config);
    } catch (err) {
        if (isUserError(err)) return this.error(err.userError);
        this.error(err);
    }
};
export default hook;
