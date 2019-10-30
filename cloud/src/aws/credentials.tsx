/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import * as fs from "fs-extra";
import * as path from "path";

import Adapt, {
    Component,
    Constructor,
    Context,
    createContext,
    PropsType,
    WithChildren,
} from "@adpt/core";

/** @beta */
export interface AwsCredentialsProps {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsRegion: string;
}

/** @beta */
export interface WithCredentials {
    awsCredentials?: AwsCredentialsProps;
}

/** @beta */
export type AwsCredentialsContext = Context<AwsCredentialsProps>;

/** @beta */
export function awsCredentialsContext(defaultCreds: AwsCredentialsProps) {
    return createContext(defaultCreds);
}

/** @beta */
export const awsDefaultCredentialsContext = awsCredentialsContext({
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    awsRegion: "",
});

/** @beta */
export function withCredentials<
    W extends Constructor<Component<any, any>>>(
    // tslint:disable-next-line:variable-name
    Wrapped: W, Ctx: AwsCredentialsContext = awsDefaultCredentialsContext
) {
    return (props: PropsType<W> & WithChildren) => {
        const { children, handle, ...rest } = props as any;
        return (
            <Ctx.Consumer key={props.key}>
                { (awsCredentials) => (
                    <Wrapped awsCredentials={awsCredentials} {...rest} >
                        {children}
                    </Wrapped>
                )}
            </Ctx.Consumer>
        );
    };
}

/** @beta */
export interface AwsCredentials {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsRegion: string;
}

/** @beta */
export interface AwsCredsOptions {
    credsFile?: string;
}

/** @beta */
export async function loadAwsCreds(options: AwsCredsOptions = {}): Promise<AwsCredentials> {
    let { credsFile } = options;
    let creds = loadEnvCreds();
    if (creds) return creds;

    if (credsFile == null) {
        const home = process.env.HOME;
        if (home == null) throw new Error(`Unable to get home directory for AWS credentials`);
        credsFile = path.join(home, ".adaptAwsCreds");
    }

    creds = await loadFileCreds(credsFile);
    if (creds == null) throw new Error(`Unable to find AWS credentials`);
    return creds;
}

function isAwsCredentials(val: unknown): val is AwsCredentials {
    function valid(obj: any, prop: string) {
        return typeof obj[prop] === "string";
    }

    if (val == null || typeof val !== "object") return false;
    return (
        valid(val, "awsAccessKeyId") &&
        valid(val, "awsSecretAccessKey") &&
        valid(val, "awsRegion")
    );
}

async function loadFileCreds(credsFile: string): Promise<null | AwsCredentials> {
    try {
        const creds = await fs.readJson(credsFile);
        if (!isAwsCredentials(creds)) return null;
        return creds;
    } catch (err) {
        return null;
    }
}

function loadEnvCreds(): null | AwsCredentials {
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_DEFAULT_REGION;
    const creds = {
        awsAccessKeyId,
        awsSecretAccessKey,
        awsRegion,
    };
    if (!isAwsCredentials(creds)) return null;
    return creds;
}
