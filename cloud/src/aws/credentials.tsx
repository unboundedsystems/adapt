import Adapt, {
    Component,
    Constructor,
    Context,
    createContext,
    PropsType,
    WithChildren,
} from "@usys/adapt";

export interface AwsCredentialsProps {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
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
});

export function withCredentials<
    W extends Constructor<Component<any, any>>>(
    // tslint:disable-next-line:variable-name
    Wrapped: W, Ctx: AwsCredentialsContext = awsDefaultCredentialsContext
) {
    return (props: PropsType<W> & WithChildren) => {
        const { children, ...rest } = props as any;
        return (
            <Ctx.Consumer>
                { (awsCredentials) => (
                    <Wrapped awsCredentials={awsCredentials} {...rest} >
                        {children}
                    </Wrapped>
                )}
            </Ctx.Consumer>
        );
    };
}
