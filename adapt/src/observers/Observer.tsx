import { isEqualUnorderedArrays } from "@usys/utils";
import { DocumentNode as GraphQLDocument, ExecutionResult, printError } from "graphql";
import {
    AdaptElement,
    AdaptElementOrNull,
    Component,
    getComponentConstructorData
} from "../jsx";
import { ObserverManagerDeployment } from "./obs_manager_deployment";
import { ObserverNameHolder } from "./registry";

type QueryResult<R = any> = ExecutionResult<R>;

export type ResultsEqualType<R = any> = (old: QueryResult<R>, newRes: QueryResult<R>) => boolean;

export interface ObserverProps<QueryData extends object> {
    observer: ObserverNameHolder;
    query: GraphQLDocument;
    variables?: { [name: string]: any };
    build: (error: Error | null, props: QueryData | undefined) => AdaptElementOrNull | Promise<AdaptElementOrNull>;
}

export class Observer<QueryData extends object = any>
    extends Component<ObserverProps<QueryData>, {}> {

    static defaultProps = { isEqual: isEqualUnorderedArrays };

    private readonly mgr: ObserverManagerDeployment;

    constructor(props: ObserverProps<QueryData>) {
        super(props);
        const ccd = getComponentConstructorData();
        this.mgr = ccd.observerManager;
    }

    async build(): Promise<AdaptElement | null> {
        let result: QueryResult;
        try {
            result = await this.mgr.executeQuery(this.props.observer, this.props.query, this.props.variables);
        } catch (err) {
            return this.props.build(err, undefined);
        }

        let err: Error | null = null;
        let needsData = false;
        if (result.errors) {
            const badErrors =
                result.errors.filter((e) => !e.message.startsWith("Adapt Observer Needs Data:"));
            if (badErrors.length !== 0) {
                const msgs = badErrors.map((e) => e.originalError ? e.stack : printError(e)).join("\n");
                err = new Error(msgs);
                (err as any).originalErrors = badErrors;
            } else {
                needsData = true;
            }
        }

        return this.props.build(err, needsData ? undefined : result.data);
    }
}
