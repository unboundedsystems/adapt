import { Handle } from "@adpt/core";
import { Stage } from "../LocalDockerImage";
import { NetworkServiceScope } from "../NetworkService";

/*
 * Match types
 */
export type Match = MatchPath | MatchRegex;

export interface MatchPath {
    type: "path";
    path: string;
}

export interface MatchRegex {
    type: "regex";
    regex: string;
}

/*
 * Dest types
 */
export type Destination = DestFiles;

export interface DestFiles {
    type: "files";
    filesRoot?: string;
}

/*
 * Files types
 */
export interface PathPair {
    src: string;
    dest: string;
}

export interface FilesLocal {
    type: "local";
    localRoot: string;
    files: PathPair[];
}

export interface FilesImageHandle {
    type: "image";
    image: Handle;
    files: PathPair[];
    stage: string;
}

export interface FilesImageResolved {
    type: "image";
    image: string;
    files: PathPair[];
    stage: string;
}

export type FilesResolved = FilesLocal | FilesImageResolved;
export type Files = FilesResolved | FilesImageHandle;

export function isFilesResolved(f: Files): f is FilesResolved {
    return f.type !== "image" || typeof f.image === "string";
}

export interface FilesInfo {
    dockerCommands: string;
    stage?: Stage;
}

/*
 * HttpServer configuration
 */
export interface Location {
    match: Match;
    dest: Destination;
}

export interface VirtualServer {
    filesRoot?: string;
    //hostname?: string | string[]
    locations: Location[];
    // TODO: Port should be virtual server specific, not one for the whole component
    //port: number;
}

export interface HttpServerProps {
    add: Files[];
    localAddRoot?: string;
    // TODO: Port should be virtual server specific, not one for the whole component
    port: number;
    scope: NetworkServiceScope;
    servers?: VirtualServer[];
}
