import { ExecutedQuery, gql, ObserverResponse } from "@usys/adapt";
import { execute } from "graphql";
import describeFixture from "mocha-nock";
import should from "should";
import { AwsCredentials, loadAwsCreds } from "../../src/aws";
import { AwsObserver } from "../../src/aws/aws_observer";

function checkBasicObs(observations: ObserverResponse) {
    should(observations).not.be.Undefined();
    should(observations).not.be.Null();

    const context = observations.context;
    should(context).not.be.Undefined();
    should(Object.keys(context)).have.length(1);

    const response = context[Object.keys(context)[0]];
    should(response).not.be.Undefined();

    return response;
}

function checkAllStacksObs(observations: ObserverResponse) {
    const response = checkBasicObs(observations);
    should(Object.keys(response)).containDeep(["Stacks", "ResponseMetadata"]);

    const stacks = response.Stacks;
    should(stacks).not.be.Undefined();
    should(stacks).be.an.Array();
    should(stacks).have.length(6);

    const stack = stacks[0];
    should(stack.StackName).equal("Evans");
    should(stack.StackStatus).equal("CREATE_COMPLETE");
    should(stack.CreationTime.valueOf()).equal(1479411286821);
    should(stack.Outputs[0].OutputValue).equal("172.31.37.228");
}

function checkEvans(stack: any) {
    should(Object.keys(stack)).have.length(4);
    should(stack.StackName).equal("Evans");
    should(stack.StackStatus).equal("CREATE_COMPLETE");
    should(stack.CreationTime).equal("1479411286821");
    should(stack.StackId).equal(
        "arn:aws:cloudformation:us-west-2:941954696364:stack/Evans/e5be2a40-acfc-11e6-a30f-50a68a20128e");
}

const describeStacksQuery = gql`
    query (
        $input: DescribeStacksInput_input!,
        $awsAccessKeyId: String!,
        $awsSecretAccessKey: String!,
        $awsRegion: String!
        ) {
        withCredentials(
            awsAccessKeyId: $awsAccessKeyId,
            awsSecretAccessKey: $awsSecretAccessKey,
            awsRegion: $awsRegion
            ) {
            DescribeStacks(body: $input) {
                Stacks {
                    StackName
                    CreationTime
                    StackStatus
                    StackId
                }
            }
        }
    }`;

describeFixture("AWS observer tests", function (this: any) {
    this.slow(500);
    this.timeout(5000);

    let awsCredentials: AwsCredentials;
    let observer: AwsObserver;
    let allStacksQuery: ExecutedQuery;
    let oneStackQuery: ExecutedQuery;
    let doesntExistQuery: ExecutedQuery;

    before("Construct schema", async function () {
        this.timeout(40 * 1000);
        this.slow(17 * 1000);

        awsCredentials = await loadAwsCreds();
        observer = new AwsObserver();
        observer.schema; //Force slow construction of schema once for whole suite

        allStacksQuery = {
            query: describeStacksQuery,
            variables: {
                input: {},
                ...awsCredentials,
            }
        };
        doesntExistQuery = {
            query: describeStacksQuery,
            variables: {
                input: { StackName: "doesntexist" },
                ...awsCredentials,
            }
        };
        oneStackQuery = {
            query: describeStacksQuery,
            variables: {
                input: { StackName: "Evans" },
                ...awsCredentials,
            }
        };
    });

    beforeEach("Instantiate observer", function () {
        this.slow(500);
        this.timeout(2 * 1000);
        observer = new AwsObserver();
    });

    async function executeQuery(query: ExecutedQuery) {
        const schema = observer.schema;
        let result = await execute(
            schema,
            query.query,
            undefined,
            undefined,
            query.variables);
        if (result.errors === undefined) return should(result.errors).not.Undefined();
        should(result.errors).length(1);
        should(result.errors[0]!.message).match(/Adapt Observer Needs Data/);

        const observations = await observer.observe([query]);

        result = await execute(
            schema,
            query.query,
            observations.data,
            observations.context,
            query.variables);
        should(result.errors).Undefined();

        const data = result.data;
        if (data === undefined) throw should(data).not.be.Undefined();
        const withCredentials = data.withCredentials;
        if (withCredentials === undefined) throw should(withCredentials).not.be.Undefined();
        const describeStacks = withCredentials.DescribeStacks;
        if (describeStacks === undefined) throw should(describeStacks).not.be.Undefined();
        const stacks = describeStacks.Stacks;
        if (stacks === undefined) throw should(stacks).not.be.Undefined();
        if (stacks !== null) should(stacks).be.an.Array();

        return stacks;
    }

    it("should observe running stacks", async () => {
        const observations = await observer.observe([allStacksQuery]);
        checkAllStacksObs(observations);
    });

    it("should observe non existent stack", async () => {
        return should(observer.observe([doesntExistQuery])).be
            .rejectedWith(/Stack with id doesntexist does not exist/);
    });

    it("should query all running stacks", async () => {
        const stacks = await executeQuery(allStacksQuery);
        should(stacks.length).be.greaterThan(0);

        checkEvans(stacks[0]);
    });

    it("should query non existent stack", async () => {
        return should(executeQuery(doesntExistQuery)).be
            .rejectedWith(/Stack with id doesntexist does not exist/);
    });

    it("should query specific stack", async () => {
        const stacks = await executeQuery(oneStackQuery);
        should(stacks).have.length(1);

        checkEvans(stacks[0]);
    });
});
