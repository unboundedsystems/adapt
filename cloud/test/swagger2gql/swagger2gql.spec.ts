import * as fs from "fs-extra";
import { GraphQLError, printSchema } from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as path from "path";
import * as should from "should";
import swagger2gql from "../../src/swagger2gql";

function lineWithContext(txt: string, lineNo: number): string {
    const contextAmt = 10;
    const allLines = txt.split(/\r?\n/);
    const rawLines = allLines.slice(lineNo - contextAmt, lineNo + contextAmt);
    const lines = rawLines.map((l, i) => (lineNo - contextAmt + i + 1).toString() + ": " + l);
    return lines.join("\n");
}

describe("Swagger to GraphQL Tests", () => {
    describe("with Kubernetes 1.8 Swagger Sepc", function () {
        this.timeout(30000);
        it("Should convert kubernetes 1.8 swagger specification and reparse schema", async () => {
            const swaggerJSON = await fs.readFile(path.join("/src/cloud/test/swagger2gql/kubernetes-1.8-swagger.json"));
            const schema = await swagger2gql(swaggerJSON.toString());
            should(schema).not.Undefined();
            should(schema).not.Null();
            const schemaTxt = printSchema(schema);
            try {
                makeExecutableSchema({ typeDefs: schemaTxt });
            } catch (e) {
                if (!(e instanceof GraphQLError)) throw e;
                const locations = e.locations;
                if (locations === undefined) throw e;
                let msg = e.toString() + "\n\n";
                for (const loc of locations) {
                    msg += lineWithContext(schemaTxt, loc.line) + "\n\n";
                }
                throw new Error(msg);
            }
        });
    });
});
