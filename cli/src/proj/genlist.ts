/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import {
    _getGen,
    Gen,
    matchDeps,
    validateGenList,
} from "./gen";
import { Project } from "./project";

const gen0: Gen = {
    name: "gen0",
    match: matchDeps,
    dependencies: {
        "@adpt/core": { allowed: "*", preferred: "*" },
        "@types/node": { allowed: "^8", preferred: "^8"},
        "source-map-support": { allowed: "^0.5.6", preferred: "^0.5.6" },
        "typescript": { allowed: ">=3.0", preferred: "^3.0.3" },
    },
};

const genList: Gen[] = [
    gen0,
];
validateGenList(genList);

export function getGen(proj: Project) {
    return _getGen(proj, genList);
}
