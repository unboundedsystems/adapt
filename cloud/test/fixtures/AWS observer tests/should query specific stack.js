var nock = require('nock');
module.exports = function() {
nock.define([
  {
    "scope": "https://cloudformation.us-west-2.amazonaws.com:443",
    "method": "POST",
    "path": "/",
    "body": "Action=DescribeStacks&StackName=Evans&Version=2010-05-15",
    "status": 200,
    "response": "<DescribeStacksResponse xmlns=\"http://cloudformation.amazonaws.com/doc/2010-05-15/\">\n  <DescribeStacksResult>\n    <Stacks>\n      <member>\n        <Outputs>\n          <member>\n            <Description>Private IP address of the server instance</Description>\n            <OutputKey>PrivateIP</OutputKey>\n            <OutputValue>172.31.37.228</OutputValue>\n          </member>\n          <member>\n            <Description>Public IP address of the server instance</Description>\n            <OutputKey>PublicIP</OutputKey>\n            <OutputValue>35.163.179.236</OutputValue>\n          </member>\n          <member>\n            <Description>FQDN of the server instance</Description>\n            <OutputKey>Hostname</OutputKey>\n            <OutputValue>evans.int.unbounded.us</OutputValue>\n          </member>\n        </Outputs>\n        <Capabilities>\n          <member>CAPABILITY_IAM</member>\n        </Capabilities>\n        <CreationTime>2016-11-17T19:34:46.821Z</CreationTime>\n        <NotificationARNs/>\n        <StackId>arn:aws:cloudformation:us-west-2:941954696364:stack/Evans/e5be2a40-acfc-11e6-a30f-50a68a20128e</StackId>\n        <StackName>Evans</StackName>\n        <Description>A basic Ubuntu server image, bootstrapped for salt</Description>\n        <StackStatus>CREATE_COMPLETE</StackStatus>\n        <DisableRollback>false</DisableRollback>\n        <Tags/>\n        <RollbackConfiguration/>\n        <DriftInformation>\n          <StackDriftStatus>NOT_CHECKED</StackDriftStatus>\n        </DriftInformation>\n        <EnableTerminationProtection>false</EnableTerminationProtection>\n        <Parameters>\n          <member>\n            <ParameterKey>KeyName</ParameterKey>\n            <ParameterValue>DefaultKeyPair</ParameterValue>\n          </member>\n          <member>\n            <ParameterKey>Hostname</ParameterKey>\n            <ParameterValue>evans</ParameterValue>\n          </member>\n          <member>\n            <ParameterKey>Roles</ParameterKey>\n            <ParameterValue>dockerhost</ParameterValue>\n          </member>\n          <member>\n            <ParameterKey>InstanceType</ParameterKey>\n            <ParameterValue>t2.medium</ParameterValue>\n          </member>\n        </Parameters>\n      </member>\n    </Stacks>\n  </DescribeStacksResult>\n  <ResponseMetadata>\n    <RequestId>ea02dc66-0488-11e9-b5ea-9f4f3afd1834</RequestId>\n  </ResponseMetadata>\n</DescribeStacksResponse>\n",
    "rawHeaders": [
      "x-amzn-RequestId",
      "ea02dc66-0488-11e9-b5ea-9f4f3afd1834",
      "Content-Type",
      "text/xml",
      "Content-Length",
      "2392",
      "Vary",
      "Accept-Encoding",
      "Date",
      "Thu, 20 Dec 2018 18:56:09 GMT"
    ]
  }
]);
};