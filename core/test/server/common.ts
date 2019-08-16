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

import should from "should";
import {
    LocalServer,
    LocalServerOptions
} from "../../src/server/local_server";
import { adaptServer, AdaptServer } from "../../src/server/server";

export async function initLocalServer(init: boolean): Promise<AdaptServer> {
    const opts: LocalServerOptions = { init };
    const server = await adaptServer("file://" + process.cwd(), opts);
    should(server instanceof LocalServer).be.True();
    return server;
}
