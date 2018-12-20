var nock = require('nock');
module.exports = function() {
nock.define([
  {
    "scope": "https://cloudformation.us-west-2.amazonaws.com:443",
    "method": "POST",
    "path": "/",
    "body": "Action=DescribeStacks&StackName=doesntexist&Version=2010-05-15",
    "status": 400,
    "response": "<ErrorResponse xmlns=\"http://cloudformation.amazonaws.com/doc/2010-05-15/\">\n  <Error>\n    <Type>Sender</Type>\n    <Code>ValidationError</Code>\n    <Message>Stack with id doesntexist does not exist</Message>\n  </Error>\n  <RequestId>e9e5901c-0488-11e9-b24f-451855a84270</RequestId>\n</ErrorResponse>\n",
    "rawHeaders": [
      "x-amzn-RequestId",
      "e9e5901c-0488-11e9-b24f-451855a84270",
      "Content-Type",
      "text/xml",
      "Content-Length",
      "297",
      "Date",
      "Thu, 20 Dec 2018 18:56:09 GMT",
      "Connection",
      "close"
    ]
  }
]);
};