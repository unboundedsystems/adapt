import { CommonOptions, parseJsonMessages, run } from "./common";

export interface ListCommonOptions extends CommonOptions {
    depth?: number;
    production?: boolean;
}
export interface ListParsedOptions extends ListCommonOptions {
}
export interface ListOptions extends ListCommonOptions {
    json?: boolean;
}

const boolNoArgOptions = [
    "json",
];

export interface ListTreeMod {
    name: string;
    versions: Modules;
}
export interface Module {
    name: string;
    version: string;
    nameVersion: string;
    children?: Module[];
    hint?: string;
    hidden?: boolean;
    color?: string;
}
export interface Modules {
    [ version: string ]: Module;
}
export type ListTreeMods = Map<string, ListTreeMod>;

const defaultOptions = {
    boolNoArgOptions,
};

export function list(options?: ListOptions) {
    const finalOpts = { ...defaultOptions, ...options };
    return run("list", finalOpts);
}

const defaultJsonOptions = {
};

export async function listParsed(options?: ListParsedOptions): Promise<ListTreeMods> {
    const finalOpts = { ...defaultJsonOptions, ...options, json: true };

    const out = await list(finalOpts);

    const objs = parseJsonMessages(out.stdout, "tree");
    if (objs.length === 0) throw new Error(`No tree list returned from yarn list`);
    if (objs.length !== 1) throw new Error(`Too many tree lists returned from yarn list`);

    const val = objs[0];
    if (typeof val.data !== "object") {
        throw new Error(`No data object returned from yarn list`);
    }
    const trees: Module[] = val.data.trees;
    if (!Array.isArray(trees)) {
        throw new Error(`No invalid trees object returned from yarn list`);
    }
    const mods = new Map<string, ListTreeMod>();
    addMods(trees);
    return mods;

    function addMods(mList: Module[]) {
        mList.map((m) => {
            const [ name, version ] = parseName(m.name);
            // Only add in definite versions, not ranges
            if (/[~^*xX]/.test(version)) return;

            let entry = mods.get(name);
            if (!entry) {
                entry = { name, versions: {} };
                mods.set(name, entry);
            }
            if (!entry.versions[version]) {
                m.nameVersion = m.name;
                m.name = name;
                m.version = version;
                entry.versions[version] = m;
                if (m.children) addMods(m.children);
            }
        });
    }
}

function parseName(nameVersion: string) {
    const arr = nameVersion.split("@");
    switch (arr.length) {
        case 2: return arr;
        case 3: return [ "@" + arr[1], arr[2] ];
    }
    throw new Error(`Unable to parse name from ${nameVersion}`);
}
