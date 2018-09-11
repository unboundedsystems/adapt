import { DocumentNode as GraphQLDocument, ExecutionResult, printError } from "graphql";
import { AdaptElement, AdaptElementOrNull, Component } from "..";
import { ObserverManagerDeployment } from "./obs_manager_deployment";

type QueryResult<R = any> = ExecutionResult<R>;

export interface ObserverEnvironment {
    observerManager: ObserverManagerDeployment;
}

export interface ObserverProps<P extends object> {
    environment: ObserverEnvironment;
    observerName: string;
    query: GraphQLDocument;
    variables?: { [name: string]: any };
    build: (error: Error | null, props: P | undefined) => AdaptElementOrNull | Promise<AdaptElementOrNull> ;
}

interface ObserverState {
    result: QueryResult;
}

export class Observer<P extends object = any> extends Component<ObserverProps<P>, ObserverState> {
    readonly state: ObserverState;

    constructor(props: ObserverProps<P>) {
        super(props);
        this.state = {
            result: {}
        };
    }

    async build(): Promise<AdaptElement | null> {
        const env = this.props.environment;
        const mgr = env.observerManager;
        let result: QueryResult;
        try {
            result = await mgr.executeQuery(this.props.observerName, this.props.query, this.props.variables);
        } catch (err) {
            return this.props.build(err, undefined);
        }

        this.setState({ result });

        let err: Error | null = null;
        if (this.state.result.errors) {
            const msgs = this.state.result.errors.map((e) => printError(e)).join("\n");
            err = new Error(msgs);
        }

        return this.props.build(err, this.state.result.data);
    }
}
