// tslint:disable-next-line:no-var-requires
const toObservable = require("@samverschueren/stream-to-observable");
import { Observable } from "rxjs";
// tslint:disable-next-line:no-submodule-imports
import { filter } from "rxjs/operators";
import split from "split";
import { Readable } from "stream";

export function taskObservable(output: Readable, promise?: Promise<any>): Observable<string> {
    return toObservable(output.pipe(split()), { await: promise })
        .pipe(filter((line: string) => !!line));
}
