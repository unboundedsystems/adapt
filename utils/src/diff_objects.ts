import { diff, Diff } from "deep-diff";
import { inspect } from "util";

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
