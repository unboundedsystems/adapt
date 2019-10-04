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

import { diff, Diff } from "deep-diff";
import { inspect as utilInspect } from "util";

function inspect(val: any): string {
    return utilInspect(val, {
        compact: true,
        breakLength: 60,
    });
}

function isIndex(key: string | number | symbol) {
    return Number.isInteger(Number(key));
}

function indent(s: string, prefix: string, first = prefix) {
    return s.split("\n")
        .map((l, i) => (i ? prefix : first) + l)
        .join("\n");
}

function formatChange<A, B>(c: Diff<A, B>): string {
    const path = c.path || [];

    if (c.kind === "A") {
        return formatChange({
            ...c.item,
            path: [ ...path, c.index ]
        });
    }

    let sPath = path.map((i) => isIndex(i) ? `[${i}]` : `.${i}`).join("");
    if (sPath.startsWith(".")) sPath = sPath.slice(1);

    switch (c.kind) {
        case "N":
            const pre1 = sPath ? sPath : "CREATED";
            return indent(`${pre1}: ${inspect(c.rhs)}`, `  + `, `+ `);
        case "D":
            const pre2 = sPath ? sPath : "DELETED";
            return indent(`${pre2}: ${inspect(c.lhs)}`, `  - `, `- `);
        case "E":
            return [
                `! ${sPath}:`,
                indent(inspect(c.lhs), `  - `),
                indent(inspect(c.rhs), `  + `),
            ].join("\n");
    }
}

export function diffObjects(a: any, b: any) {
    const d = diff(a, b);
    if (!d) return "";

    const str = d
        .map(formatChange)
        .join("\n");
    return str;
}
