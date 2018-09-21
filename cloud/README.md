# Unbounded Adapt Cloud Component Library

## Note on Test Performance

If you want to speed up the k8s plugin tests for the cloud directory, most of the time is spent starting and stopping a local minikube instance.  You can avoid this by starting a long running minikube instance and adding ADAPT_TEST_MINIKUBE to your environment like so:
```
cd cloud

docker network create test_minikube

docker run --privileged -d --name test_minikube --network test_minikube --network-alias kubernetes unboundedsystems/minikube-dind
```

Then run the tests (from the cloud directory):
```
ADAPT_TEST_MINIKUBE=test_minikube ../bin/npm run test
```

Or do a make (from top level):
```
ADAPT_TEST_MINIKUBE=test_minikube make
```
