import {
    ASTNode,
    FieldNode,
    GraphQLOutputType,
    GraphQLSchema,
    isObjectType,
    Kind,
    SelectionSetNode,
    visit,
    DocumentNode,
    GraphQLField,
    isNonNullType,
    OperationDefinitionNode,
} from "graphql";
import * as ld from "lodash";

function buildSelectionSet(names: string[], orig?: SelectionSetNode): SelectionSetNode | undefined {
    if (names.length === 0) return orig;

    const newSelections = names.map((n) => ({
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: n }
    }));

    if (!orig) {
        return {
            kind: Kind.SELECTION_SET,
            selections: newSelections
        };
    }

    const ret = ld.clone(orig);
    const origNames = orig.selections.map((f) => {
        if (f.kind !== Kind.FIELD) return undefined;
        return f.alias ? f.alias.value : f.name.value;
    }).filter((x) => x !== undefined);
    const origSet = new Set(origNames);
    const newSelectionsLessOrig = newSelections.filter((f) => !origSet.has(f.name.value));
    const finalSelections = orig.selections.concat(newSelectionsLessOrig);
    ret.selections = finalSelections;
    return ret;
}

function needsNoArgs(f: GraphQLField<unknown, unknown>): boolean {
    if (!f.args) return true;
    if (f.args.length === 0) return true;
    const noDefaultArgs = f.args.filter((arg) => arg.defaultValue === undefined);
    if (noDefaultArgs.length === 0) return true;
    const nonNullArgs = f.args.filter((arg) => isNonNullType(arg.type));
    return nonNullArgs.length === 0;
}

class AllDirectiveVisitor {
    get type() { return ld.last(this.typeStack); }
    typeStack: (GraphQLOutputType | null)[];

    leave = {
        OperationDefinition: () => {
            this.typeStack.pop();
            if (this.typeStack.length !== 0) throw new Error("Internal Error, typeStack not empty after operation");
        },

        Field: (f: FieldNode): ASTNode => {
            const type = this.type;
            this.typeStack.pop();
            const dirs = f.directives;
            if (dirs === undefined) return f;
            if (!dirs.find((d) => d.name.value === "all")) return f;
            if (!isObjectType(type)) return f;

            const origSel = f.selectionSet;
            const fields = type.getFields();
            const fieldNames = Object.keys(fields).filter((n) => {
                return needsNoArgs(fields[n]);
            });

            const sel = buildSelectionSet(fieldNames, origSel);

            return {
                ...f,
                selectionSet: sel
            };
        }
    };

    enter = {
        OperationDefinition: (op: OperationDefinitionNode) => {
            switch (op.operation) {
                case "query":
                    this.typeStack = [this.schema.getQueryType() || null];
                    break;
                case "mutation":
                    this.typeStack = [this.schema.getMutationType() || null];
                    break;
                case "subscription":
                    this.typeStack = [this.schema.getSubscriptionType() || null];
            }
        },

        Field: (f: FieldNode) => {
            const fieldName = f.name.value;
            const type = this.type;
            if (type === undefined) throw new Error("Internal error, no type for field");
            if (!isObjectType(type)) return;

            if (type === null) {
                this.typeStack.push(null);
                return;
            }
            const fields = type.getFields();
            const field = fields[fieldName];
            if (field === undefined) {
                this.typeStack.push(null);
                return;
            }

            this.typeStack.push(field.type);
        }
    };

    constructor(public schema: GraphQLSchema) { }

}

export function applyAdaptTransforms(schema: GraphQLSchema, q: DocumentNode): DocumentNode {
    return visit(q, new AllDirectiveVisitor(schema));
}