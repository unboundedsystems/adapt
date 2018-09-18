import { isEqualUnorderedArrays } from "@usys/utils";
import { DocumentNode as GraphQLDocument, ExecutionResult, printError } from "graphql";
import { AdaptElement, AdaptElementOrNull, Component } from "..";
import { getComponentConstructorData } from "../jsx";
import { ObserverManagerDeployment } from "./obs_manager_deployment";

type QueryResult<R = any> = ExecutionResult<R>;

export type ResultsEqualType<R = any> = (old: QueryResult<R>, newRes: QueryResult<R>) => boolean;

export interface ObserverProps<QueryData extends object> {
    observerName: string;
    query: GraphQLDocument;
    variables?: { [name: string]: any };
    build: (error: Error | null, props: QueryData | undefined) => AdaptElementOrNull | Promise<AdaptElementOrNull>;
    isEqual: ResultsEqualType<QueryData>;
}

interface ObserverState {
    result: QueryResult;
}

export class Observer<QueryData extends object = any>
    extends Component<ObserverProps<QueryData>, ObserverState> {

    static defaultProps = { isEqual: isEqualUnorderedArrays };

    private readonly mgr: ObserverManagerDeployment;

    constructor(props: ObserverProps<QueryData>) {
        super(props);
        const ccd = getComponentConstructorData();
        this.mgr = ccd.observerManager;
    }

    initialState() { return { result: {} }; }

    async build(): Promise<AdaptElement | null> {
        let result: QueryResult;
        try {
            result = await this.mgr.executeQuery(this.props.observerName, this.props.query, this.props.variables);
        } catch (err) {
            return this.props.build(err, undefined);
        }

        if (!this.props.isEqual(this.state.result, result)) {
            this.setState({ result });
        }

        let err: Error | null = null;
        if (this.state.result.errors) {
            const msgs = this.state.result.errors.map((e) => printError(e)).join("\n");
            err = new Error(msgs);
        }

        return this.props.build(err, this.state.result.data);
    }
}
