import {
    ASTNode,
    FieldNode,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLSchema,
    isObjectType,
    Kind,
    SelectionSetNode,
    visit,
    DocumentNode,
    GraphQLField,
} from "graphql";
import * as ld from "lodash";

function schemaQueryTypeOrThrow(schema: GraphQLSchema) {
    const qType = schema.getQueryType();
    if (qType == null) throw new Error("No query type");
    return qType;
}

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
    return f.args.find((arg) => arg.defaultValue === undefined) === undefined;
}

class AllDirectiveVisitor {
    get type() { return ld.last(this.typeStack); }
    typeStack: (GraphQLOutputType | null)[];
    queryType: GraphQLObjectType;

    leave = {
        Document: () => {
            this.typeStack = [];
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
        Document: () => {
            this.typeStack = [this.queryType];
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

    constructor(public schema: GraphQLSchema) {
        this.queryType = schemaQueryTypeOrThrow(schema);
    }
}

export function applyAdaptTransforms(schema: GraphQLSchema, q: DocumentNode): DocumentNode {
    return visit(q, new AllDirectiveVisitor(schema));
}