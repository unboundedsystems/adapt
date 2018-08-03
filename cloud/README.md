# Unbounded Adapt Cloud Component Library

## Note on Test Performance

If you want to speed up the k8s plugin tests for the cloud directory, most of the time is spent starting and stopping a local minikube instance.  You can avoid this by starting a long running minikube instance and adding ADAPT_TEST_MINIKUBE to the docker environment via DOCKER_ARGS when you run the tests, like so:
```
cd cloud

docker network create test_minikube

docker run --privileged -d --name test_minikube --network test_minikube --network-alias kubernetes quay.io/aspenmesh/minikube-dind
```

Then run the tests (from the cloud directory):
```
DOCKER_ARGS="-e ADAPT_TEST_MINIKUBE=test_minikube" ../bin/npm run test
```

Or do a make (from top level):
```
DOCKER_ARGS="-e ADAPT_TEST_MINIKUBE=test_minikube" ./bin/make
```
