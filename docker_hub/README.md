# Adapt Docker Image

## Building the image

Build the Adapt Docker image as follows (replacing `VERSION` with the version of Adapt that
you want packaged):

```
cd docker_hub
./build.sh VERSION
```

## Using the image

Use the Adapt Docker image as follows:

1. Pull the adapt image to your machine: `docker pull unboundedsystems/adapt:latest`

2. Store the `bash-alias.sh` file somewhere and edit your ~/.bashrc startup file to contain (and then restart
your shell): ```source /path/to/bash-alias.sh```
 
3. You should now have an `adapt` shell function that will run Adapt for you using Docker.
