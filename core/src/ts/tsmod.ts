/**
 * This is a helper module that allows for lazy loading the typescript
 * module, yet still giving access to the static types we use.
 * This allows adapt (and the adapt CLI in particular) to not require
 * typescript and instead use the version of typescript installed in a
 * given project.
 */
import { InternalError, UserError } from "@adpt/utils";
import tsTypes from "typescript";

let tsmod_: typeof tsTypes | undefined;

export function tsmod(): typeof tsTypes {
    if (!tsmod_) {
        try {
            // tslint:disable-next-line:no-var-requires
            tsmod_ = require("typescript");
        } catch (err) {
            throw new UserError(
                `Unable to load typescript module. This operation may only be ` +
                `possible from within an Adapt project directory`);
        }
    }
    if (!tsmod_) throw new InternalError(`tsmod_ cannot be null`);
    return tsmod_;
}

/* NOTE(mark): There does not seem to be a way to export *only* the types
 * from the typescript module. And there also appears to be a bug in the
 * compiler feature that refrains from generating a runtime require at the
 * top level IFF you do a namespace import (import * as ts ...) and only access
 * types from it. (Note: may have something to do with using tslib?)
 * So instead, import one type at a time. Ugh.
 */
type CancellationToken = import ("typescript").CancellationToken;
type CompilerHost = import ("typescript").CompilerHost;
type CompilerOptions = import ("typescript").CompilerOptions;
type Diagnostic = import ("typescript").Diagnostic;
type EmitOutput = import ("typescript").EmitOutput;
type Extension = import ("typescript").Extension;
type IScriptSnapshot = import ("typescript").IScriptSnapshot;
type LanguageService = import ("typescript").LanguageService;
type LanguageServiceHost = import ("typescript").LanguageServiceHost;
type ModuleResolutionHost = import ("typescript").ModuleResolutionHost;
type ResolvedModule = import ("typescript").ResolvedModule;
type ResolvedModuleFull = import ("typescript").ResolvedModuleFull;
type OutputFile = import ("typescript").OutputFile;
type ScriptTarget = import ("typescript").ScriptTarget;
type SourceFile = import ("typescript").SourceFile;

export {
    CancellationToken,
    CompilerHost,
    CompilerOptions,
    Diagnostic,
    EmitOutput,
    Extension,
    IScriptSnapshot,
    LanguageService,
    LanguageServiceHost,
    ModuleResolutionHost,
    OutputFile,
    ResolvedModule,
    ResolvedModuleFull,
    ScriptTarget,
    SourceFile,
};
