var nock = require('nock');
module.exports = function() {
nock.define([
  {
    "scope": "https://ec2.us-west-2.amazonaws.com:443",
    "method": "POST",
    "path": "/",
    "body": "Action=DescribeInstances&InstanceId.1=i-06995b7beebdef4c9&Version=2016-11-15",
    "status": 200,
    "response": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DescribeInstancesResponse xmlns=\"http://ec2.amazonaws.com/doc/2016-11-15/\">\n    <requestId>26855dd0-5ab0-4ee2-8862-cd7ee656a371</requestId>\n    <reservationSet/>\n</DescribeInstancesResponse>",
    "rawHeaders": [
      "Content-Type",
      "text/xml;charset=UTF-8",
      "Transfer-Encoding",
      "chunked",
      "Vary",
      "Accept-Encoding",
      "Date",
      "Sat, 05 Jan 2019 17:24:06 GMT",
      "Server",
      "AmazonEC2"
    ]
  }
]);
};