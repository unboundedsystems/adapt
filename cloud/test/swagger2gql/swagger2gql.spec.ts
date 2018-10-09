import * as fs from "fs-extra";
import { printSchema } from "graphql";
import * as path from "path";
import * as should from "should";
import swagger2gql from "../../src/swagger2gql";

describe("Swagger to GraphQL Tests", () => {
    it("Should convert kubernetes 1.8 swagger specification", async () => {
        const swaggerJSON = await fs.readFile(path.join("/src/cloud/test/swagger2gql/kubernetes-1.8-swagger.json"));
        const schema = await swagger2gql(swaggerJSON);
        should(schema).not.Undefined();
        should(schema).not.Null();
        console.log(printSchema(schema));
    });
});
