import {
    useState,
} from "@adpt/core";
import { Dispatcher } from "@adpt/utils";
import { isObject, isString } from "lodash";
import { getInstanceValue } from "../hooks";
import { ImageInfo } from "../LocalDockerImage";
import {
    Files,
    FilesInfo,
    FilesResolved,
    isFilesResolved,
} from "./http_server_types";

export function useResolvedFiles(files: Files[]): FilesResolved[] | undefined {
    const [resolved, setResolved] = useState<FilesResolved[] | undefined>(undefined);

    setResolved(() => {
        const done: FilesResolved[] = [];

        for (const f of files) {
            if (isFilesResolved(f)) {
                done.push(f);
                continue;
            }
            const image = getInstanceValue<ImageInfo | undefined>(f.image, undefined, "image", { throwOnNoElem: true });
            if (image && isObject(image) && isString(image.id)) {
                done.push({
                    ...f,
                    image: image.id
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

export function useFilesInfo(files: Files[]): FilesInfo[] | undefined {
    const resolved = useResolvedFiles(files);
    return resolved && resolved.map((f) => filesFrom.dispatch(f));
}
