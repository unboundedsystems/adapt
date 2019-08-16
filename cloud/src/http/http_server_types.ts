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

import { Handle } from "@adpt/core";
import { Stage } from "../docker";
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
