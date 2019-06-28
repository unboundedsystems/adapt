import * as fs from "fs-extra";
import * as path from "path";

import Adapt, {
    Component,
    Constructor,
    Context,
    createContext,
    PropsType,
    useReadyFrom,
    WithChildren,
} from "@adpt/core";

export interface AwsCredentialsProps {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsRegion: string;
}
export interface WithCredentials {
    awsCredentials?: AwsCredentialsProps;
}

export type AwsCredentialsContext = Context<AwsCredentialsProps>;

export function awsCredentialsContext(defaultCreds: AwsCredentialsProps) {
    return createContext(defaultCreds);
}

export const awsDefaultCredentialsContext = awsCredentialsContext({
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    awsRegion: "",
});

export function withCredentials<
    W extends Constructor<Component<any, any>>>(
    // tslint:disable-next-line:variable-name
    Wrapped: W, Ctx: AwsCredentialsContext = awsDefaultCredentialsContext
) {
    return (props: PropsType<W> & WithChildren) => {
        const { children, handle, ...rest } = props as any;
        const wHand = Adapt.handle();
        useReadyFrom(wHand);
        return (
            <Ctx.Consumer key={props.key}>
                { (awsCredentials) => (
                    <Wrapped awsCredentials={awsCredentials} handle={wHand} {...rest} >
                        {children}
                    </Wrapped>
                )}
            </Ctx.Consumer>
        );
    };
}

export interface AwsCredentials {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsRegion: string;
}

export interface AwsCredsOptions {
    credsFile?: string;
}

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
