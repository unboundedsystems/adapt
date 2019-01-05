import { ExecutedQuery, gql, ObserverResponse } from "@usys/adapt";
import { execute } from "graphql";
import describeFixture from "mocha-nock";
import should from "should";
import { AwsCredentials, loadAwsCreds } from "../../src/aws";
import { AwsEc2Observer } from "../../src/aws/ec2_observer";

function checkBasicObs(observations: ObserverResponse) {
    should(observations).not.be.Undefined();
    should(observations).not.be.Null();

    const context = observations.context;
    should(context).not.be.Undefined();
    should(Object.keys(context)).have.length(1);

    const response = context[Object.keys(context)[0]];
    should(response).not.be.Undefined();

    const reservations = response.Reservations;
    should(reservations).not.be.Undefined();
    should(reservations).be.an.Array();

    return reservations;
}

function checkAllInstancesObs(observations: ObserverResponse) {
    const reservations = checkBasicObs(observations);

    const r0 = reservations[0];
    should(r0).not.be.Undefined();
    should(r0).not.be.Null();

    const instances = r0.Instances;
    should(instances).be.an.Array();
}

function checkEvans(reservation: any) {
    should(reservation.ReservationId).equal("r-0a5344b6f1231ba05");

    const instances = reservation.Instances;
    should(instances).be.an.Array();
    should(instances).have.length(1);

    const instance = instances[0];
    should(instance.InstanceId).equal("i-0164ad2ee10055128");
    should(instance.PrivateIpAddress).equal("172.31.37.228");

    const tags = instance.Tags;
    should(tags).be.an.Array();

    const nameTag = tags[0];
    should(nameTag.Key).equal("Name");
    should(nameTag.Value).equal("evans");
}

const describeInstancesQuery = gql`
    query (
        $input: DescribeInstancesRequest_input!,
        $awsAccessKeyId: String!,
        $awsSecretAccessKey: String!,
        $awsRegion: String!
        ) {
        withCredentials(
            awsAccessKeyId: $awsAccessKeyId,
            awsSecretAccessKey: $awsSecretAccessKey,
            awsRegion: $awsRegion
            ) {
            DescribeInstances(body: $input) {
                Reservations {
                    ReservationId
                    Instances {
                        InstanceId
                        InstanceType
                        PrivateIpAddress
                        Tags {
                            Key
                            Value
                        }
                    }
                }
            }
        }
    }`;
            //DescribeInstances(body: $input) @all(depth: 10)

describeFixture("AWS EC2 observer tests", function (this: any) {
    this.slow(500);
    this.timeout(5000);

    let awsCredentials: AwsCredentials;
    let observer: AwsEc2Observer;
    let allInstancesQuery: ExecutedQuery;
    let oneInstanceQuery: ExecutedQuery;
    let doesntExistQuery: ExecutedQuery;
    let tagFilterQuery: ExecutedQuery;

    before("Construct schema", async function () {
        this.timeout(40 * 1000);
        this.slow(17 * 1000);

        awsCredentials = await loadAwsCreds();
        observer = new AwsEc2Observer();
        observer.schema; //Force slow construction of schema once for whole suite

        allInstancesQuery = {
            query: describeInstancesQuery,
            variables: {
                input: {},
                ...awsCredentials,
            }
        };
        doesntExistQuery = {
            query: describeInstancesQuery,
            variables: {
                input: { InstanceIds: ["i-06995b7beebdef4c9"] },
                ...awsCredentials,
            }
        };
        oneInstanceQuery = {
            query: describeInstancesQuery,
            variables: {
                input: { InstanceIds: ["i-0164ad2ee10055128"] },
                ...awsCredentials,
            }
        };
        tagFilterQuery = {
            query: describeInstancesQuery,
            variables: {
                input: {
                    Filters: [
                        {
                            Name: "tag:aws:cloudformation:stack-name",
                            Values: [ "Evans" ]
                        }
                    ]
                },
                ...awsCredentials,
            }
        };
    });

    beforeEach("Instantiate observer", function () {
        this.slow(500);
        this.timeout(2 * 1000);
        observer = new AwsEc2Observer();
    });

    async function executeQuery(query: ExecutedQuery) {
        const schema = observer.schema;
        let result = await execute(
            schema,
            query.query,
            undefined,
            undefined,
            query.variables);
        if (result.errors === undefined) throw should(result.errors).not.Undefined();
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
        const describeInstances = withCredentials.DescribeInstances;
        if (describeInstances === undefined) throw should(describeInstances).not.be.Undefined();
        const reservations = describeInstances.Reservations;
        should(reservations).be.an.Array();

        return reservations;
    }

    it("should observe running instances", async () => {
        const observations = await observer.observe([allInstancesQuery]);
        checkAllInstancesObs(observations);
    });

    it("should observe non existent instance", async () => {
        const observations = await observer.observe([doesntExistQuery]);
        const reservations = checkBasicObs(observations);
        should(reservations).have.length(0);
    });

    it("should query all running instances", async () => {
        const reservations = await executeQuery(allInstancesQuery);
        should(reservations).have.length(7);

        checkEvans(reservations[0]);
    });

    it("should query non existent instance", async () => {
        const reservations = await executeQuery(doesntExistQuery);
        should(reservations).have.length(0);
    });

    it("should query specific instance", async () => {
        const reservations = await executeQuery(oneInstanceQuery);
        should(reservations).have.length(1);

        checkEvans(reservations[0]);
    });

    it("should query with filter", async () => {
        const reservations = await executeQuery(tagFilterQuery);
        should(reservations).have.length(1);

        checkEvans(reservations[0]);
    });
});
