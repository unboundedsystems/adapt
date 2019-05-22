// tslint:disable-next-line: no-submodule-imports
import * as ParserFlags from "@oclif/parser/lib/flags";

export interface HasFlags<T extends {} = {}> {
    flags: ParserFlags.Input<T>;
}

type FlagType<Ctor extends HasFlags, K extends keyof Ctor["flags"]> =
    Ctor["flags"][K] extends ParserFlags.IFlagBase<infer U, any> ? U : never;

/**
 * Given an object that has an oclif flags configuration (the class constructor
 * for a Command), returns the type of the parsed flags object.
 */
export type OutputFlags<Ctor extends HasFlags> = {
    [K in keyof Ctor["flags"]]: FlagType<Ctor, K>;
};
