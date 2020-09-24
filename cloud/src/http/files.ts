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

import {
    callInstanceMethod,
    Handle,
    useState,
} from "@adpt/core";
import { Dispatcher, notNull } from "@adpt/utils";
import { isObject, isString } from "lodash";
import { ImageInfo } from "../docker";
import {
    Files,
    FilesInfo,
    FilesResolved,
    isFilesResolved,
} from "./http_server_types";

/** @public */
export function useResolvedFiles(files: Files[]): FilesResolved[] | undefined {
    const [resolved, setResolved] = useState<FilesResolved[] | undefined>(undefined);

    setResolved(() => {
        const done: FilesResolved[] = [];

        for (const f of files) {
            if (isFilesResolved(f)) {
                done.push(f);
                continue;
            }
            const image = callInstanceMethod<ImageInfo | undefined>(f.image, undefined, "image");
            const imgName = image && isObject(image) && isString(image.nameTag) ? image.nameTag : null;
            if (image && !imgName) {
                throw new Error(`Cannot use container image as file source. Image exists but does not have a tag.`);
            }
            if (imgName) {
                done.push({
                    ...f,
                    image: imgName,
                });
            } else {
                return undefined;
            }
        }
        return done;
    });

    return resolved;
}

const filesFrom = new Dispatcher<FilesResolved, FilesInfo>("Files");

filesFrom.add("local", (fObj) => {
    const dockerCommands = fObj.files
        .map(({ src, dest }) => `COPY ${src} ${dest}`)
        .join("\n");
    return { dockerCommands };
});

filesFrom.add("image", (fObj) => {
    const dockerCommands = fObj.files
        .map(({ src, dest }) => `COPY --from=${fObj.stage} ${src} ${dest}`)
        .join("\n");

    return { dockerCommands, stage: { image: fObj.image, name: fObj.stage } };
});

/** @public */
export function useFilesInfo(files: Files[]): FilesInfo[] | undefined {
    const resolved = useResolvedFiles(files);
    return resolved && resolved.map((f) => filesFrom.dispatch(f));
}

/**
 * Returns all `Handle`s referenced by the set of `files`.
 * @public
 */
export function fileHandles(files: Files[]): Handle[] {
    return files.map((f) => isFilesResolved(f) ? null : f.image).filter(notNull);
}
