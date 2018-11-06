import {
    ASTNode,
    DocumentNode,
    FieldNode,
    GraphQLField,
    GraphQLOutputType,
    GraphQLSchema,
    isNonNullType,
    isObjectType,
    Kind,
    OperationDefinitionNode,
    SelectionSetNode,
    visit,
} from "graphql";
import * as ld from "lodash";
import { InternalError } from "../error";

function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
}

function buildSelectionSet(
    type: GraphQLOutputType,
    orig?: SelectionSetNode,
    allDepth: number = 1): SelectionSetNode | undefined {

    if (allDepth === 0) return orig;
    if (!isObjectType(type)) return orig; //FIXME(manishv) handle interfaces and fragments spreads

    const origNames = orig
        ? orig.selections.map((f) => {
            if (f.kind !== Kind.FIELD) return undefined; //FIXME(manishv) Need to look into fragment refs here
            return f.alias ? f.alias.value : f.name.value;
        }).filter((x) => x !== undefined)
        : [];
    const origSet = new Set(origNames);
    const fields = type.getFields();

    const newSelectionNamesLessOrig = Object.keys(fields).filter((n) => !origSet.has(n));
    const newSelectionsLessOrig = newSelectionNamesLessOrig.map((name) => {
        const field = fields[name];
        if (!needsNoArgs(field)) return undefined;
        const selectionSet = buildSelectionSet(field.type, undefined, allDepth - 1);
        return {
            kind: Kind.FIELD,
            name: { kind: Kind.NAME, value: name },
            selectionSet
        };
    }).filter(notUndefined);

    const finalSelections = orig ? orig.selections.concat(newSelectionsLessOrig) : newSelectionsLessOrig;
    return {
        kind: Kind.SELECTION_SET,
        loc: orig ? orig.loc : undefined,
        selections: finalSelections
    };
}

function needsNoArgs(f: GraphQLField<unknown, unknown>): boolean {
    if (!f.args) return true;
    if (f.args.length === 0) return true;
    const noDefaultArgs = f.args.filter((arg) => arg.defaultValue === undefined);
    if (noDefaultArgs.length === 0) return true;
    const nonNullArgs = f.args.filter((arg) => isNonNullType(arg.type));
    return nonNullArgs.length === 0;
}

function findAllDepth(n: FieldNode | OperationDefinitionNode): number {
    const dirs = n.directives;
    if (dirs === undefined) return 0;
    const alls = dirs.filter((d) => d.name.value === "all");
    if (alls.length === 0) return 0;
    const depths = alls.map((all) => {
        const args = all.arguments;
        if (!args || args.length === 0) return 1;
        const depthArgs = args.filter((a) => a.name.value === "depth");
        const depthValues = depthArgs.map((da) => {
            const valNode = da.value;
            if (valNode.kind !== Kind.INT) throw new Error("@all has a non-integer depth argument");
            const ret = Number(valNode.value);
            if (isNaN(ret)) throw new Error("@all has a non-integer depth argument");
            if (ret < 0) throw new Error("@all has depth < 0");
            return ret;
        });

        return Math.max(0, ...depthValues);
    });

    return Math.max(0, ...depths);
}

interface InfoElement {
    type: GraphQLOutputType | null;
    allDepth: number;
}

class AllDirectiveVisitor {
    infoStack: InfoElement[];

    leave = {
        OperationDefinition: (op: OperationDefinitionNode) => this.processFieldOrOpNode(op),
        Field: (f: FieldNode) => this.processFieldOrOpNode(f)
    };

    enter = {
        OperationDefinition: (op: OperationDefinitionNode) => {
            const allDepth = findAllDepth(op);
            switch (op.operation) {
                case "query":
                    this.infoStack = [{ type: this.schema.getQueryType() || null, allDepth }];
                    break;
                case "mutation":
                    this.infoStack = [{ type: this.schema.getMutationType() || null, allDepth }];
                    break;
                case "subscription":
                    this.infoStack = [{ type: this.schema.getSubscriptionType() || null, allDepth }];
            }
        },

        Field: (f: FieldNode) => {
            const fieldName = f.name.value;
            const info = ld.last(this.infoStack);
            if (info === undefined) throw new InternalError(`no info for field: ${fieldName}`);

            const type = info.type;
            if (type === undefined) throw new InternalError(`no type for field: ${fieldName}`);
            if (!isObjectType(type)) return; //FIXME(manishv) Fix fragment spreads and interfaces here

            const allDepth = Math.max(findAllDepth(f), (info.allDepth - 1));

            if (type === null) {
                this.infoStack.push({ type: null, allDepth });
                return;
            }
            const fields = type.getFields();
            const field = fields[fieldName];
            if (field === undefined) {
                this.infoStack.push({ type: null, allDepth });
                return;
            }

            this.infoStack.push({ type: field.type, allDepth });
        }
    };

    constructor(public schema: GraphQLSchema) { }

    processFieldOrOpNode = (n: FieldNode | OperationDefinitionNode): ASTNode => {
        const info = this.infoStack.pop();
        if (!info) return n;

        const type = info.type;
        if (!isObjectType(type)) return n;
        if (info.allDepth === 0) return n;

        const origSel = n.selectionSet;
        const sel = buildSelectionSet(type, origSel, info.allDepth);

        if (n.kind === Kind.OPERATION_DEFINITION) {
            if (sel === undefined) {
                throw new Error("Cannot have empty selection set at top-level operation: " + n.operation);
            }
            return {
                ...n,
                selectionSet: sel
            };
        }

        return {
            ...n,
            selectionSet: sel
        };
    }
}

export function applyAdaptTransforms(schema: GraphQLSchema, q: DocumentNode): DocumentNode {
    return visit(q, new AllDirectiveVisitor(schema));
}
