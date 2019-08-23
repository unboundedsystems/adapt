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

import Adapt, {
    handle,
    Sequence,
    SFCBuildProps,
    SFCDeclProps,
    useMethodFrom,
} from "@adpt/core";
import { Files, HttpServer, HttpServerProps, } from "../http";
import { LocalNodeImage, NodeImageBuildOptions, } from "./LocalNodeImage";

/**
 * Props for {@link nodejs.ReactApp}.
 * @public
 */
export interface ReactAppProps {
    /**
     * The source code directory to build.
     * @remarks
     * This directory should contain the `package.json` file for the React
     * app.
     */
    srcDir: string;
    /**
     * Options to be passed to the `LocalNodeImage` prop called `options`.
     */
    buildOptions: NodeImageBuildOptions;
    /**
     * Options to be passed to the `HttpServer` component.
     */
    httpOptions: Partial<HttpServerProps>;
}

const defaultBuildOptions = {
    imageName: "react-app",
    packageManager: "yarn",
    runNpmScripts: "build",
};

const defaultHttpOptions = {
    scope: "cluster-internal" as HttpServerProps["scope"],
};

const defaultOptions = {
    buildOptions: {},
    httpOptions: {},
};

/**
 * A partially abstract component that builds
 * {@link https://reactjs.org | ReactJS} source code and serves the resulting
 * files via an {@link http.HttpServer}.
 *
 * @remarks
 * To use this component, the `srcDir` prop must be the path to the root of
 * a ReactJS project, which contains a package.json file. The component will
 * build a Docker container image by:
 *
 * - starting with an official Node.js base image
 *
 * - copying `srcDir` into the container image
 *
 * - executing `yarn run build`
 *
 * It will then copy the resulting `build` directory into an {@link http.HttpServer}
 * component.
 *
 * Abstract components:
 *
 * This component uses the following abstract components (via
 * {@link http.HttpServer})which must be replaced via style sheet rules:
 *
 * - {@link Service}
 *
 * - {@link NetworkService}
 *
 * - {@link Container}
 *
 * The {@link NetworkService} and {@link Container} components are both
 * children of the {@link Service} component.
 *
 * Instance methods:
 *
 * - hostname(): string | undefined
 *
 *   Returns the hostname of the NetworkService, once it is known.
 *
 * - port(): number | undefined
 *
 *   Returns the port number of the NetworkService, once it is known.
 *
 * @public
 */
export function ReactApp(props: SFCDeclProps<ReactAppProps, typeof defaultOptions>) {
    const bProps = props as SFCBuildProps<ReactAppProps, typeof defaultOptions>;
    const buildOptions = {
        ...defaultBuildOptions,
        ...bProps.buildOptions
    };
    const [ appImg, web ] = [ handle(), handle() ];

    useMethodFrom(web, "hostname");
    useMethodFrom(web, "port");

    const add: Files[] = [
        {
            type: "image", image: appImg, stage: "app",
            files: [{ src: "/app/build", dest: "/www/static" }]
        },
        ...(bProps.httpOptions.add || [])
    ];
    const httpOptions = {
        ...defaultHttpOptions,
        ...bProps.httpOptions,
        add,
    };

    return (
        <Sequence key={bProps.key}>
            <LocalNodeImage
                key={bProps.key + "-img"}
                handle={appImg}
                srcDir={bProps.srcDir}
                options={buildOptions}
            />
            <HttpServer
                key={bProps.key}
                handle={web}
                {...httpOptions}
            />
        </Sequence>
    );
}
(ReactApp as any).defaultProps = defaultOptions;
