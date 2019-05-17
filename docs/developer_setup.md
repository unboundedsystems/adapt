# Adapt Developer Setup - Building, Testing, and CI

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [First: Docker Hub Credentials](#first-docker-hub-credentials)
- [Quick Start](#quick-start)
- [Complete Testing](#complete-testing)
    - [Local AWS credentials](#local-aws-credentials)
- [Note on Test Performance](#note-on-test-performance)
- [Parallel make](#parallel-make)
- [Memory usage debugging](#memory-usage-debugging)
- [Debugging the CLI and other users of the `adapt/src/ops` module](#debugging-the-cli-and-other-users-of-the-adaptsrcops-module)
- [Setting up CI for your fork](#setting-up-ci-for-your-fork)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


## First: Docker Hub Credentials

**You'll need to sign up to have your own login on
[Docker Hub](hub.docker.com).**

Once you have your Docker Hub login set up, from a Linux shell, type:
```
docker login
```
It will prompt you for your Docker Hub username (NOT your email) and password.

If you got logged in successfully, there should now be a file
`${HOME}/.docker/config.json` that contains an *unencrypted* version
of your password. Treat it like you would your private SSH keys.

This will be used to pull private images from the
unboundedsystems Docker Hub repos.

## Quick Start
Simply running `make` from the project root directory will build all sub-projects
and run the majority of the tests.
```
make
```

## Complete Testing
Setting the environment variable `ADAPT_RUN_LONG_TESTS=1` will allow the complete
set of tests to run. This is the set of tests that run in CI. Some tests do
require additional information, such as cloud credentials to be set.
```
ADAPT_RUN_LONG_TESTS=1 make
```

### Local AWS credentials
To run tests against the real AWS API, you'll need to set up credentials. Although
you can set the standard AWS environment variables (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`), the recommended way to set
credentials specific to the Adapt unit tests is to create the file
`.adaptAwsCreds` in your home directory where the contents are JSON like this:
```
{
    "awsAccessKeyId": "your key ID",
    "awsSecretAccessKey": "your secret key",
    "awsRegion": "us-west-2"
}
```
Note that your `awsRegion` **MUST** be `us-west-2`.

## Note on Test Performance

If you want to speed up the kubernetes-related tests, significant time is
spent starting and stopping a local kubernetes instance.  You can avoid this
by starting a long running kubernetes instance and adding ADAPT_TEST_K8S
to your environment like so:
```
docker network create k3s
docker run --privileged --rm -d --name k3s --hostname k3s --network k3s unboundedsystems/k3s-dind
```

Then run the tests:
```
ADAPT_TEST_K8S=k3s make test
```

## Parallel make
The environment variable `ADAPT_PARALLEL_MAKE` controls the running of
parallel jobs in the build & test process. By default, the number of parallel
jobs is set to the detected number of processor cores on the system. To set
it to only use 2 parallel jobs:
```
ADAPT_PARALLEL_MAKE="-j 2" make
```
Or to turn off parallel jobs:
```
ADAPT_PARALLEL_MAKE= make
```

## Memory usage debugging
Some of the projects in the repo use heapdump-mocha (currently adapt and cli
enable it). For those projects, setting the environment variable
`ADAPT_TEST_HEAPDUMP=1` enables heap usage warning messages after each mocha
test if that test leaks more than a certain threshold of memory. It also enables
a message at the end of all tests that shows the total amount of memory used
for the entire test run.

The heapdump-mocha module also has the ability to write heap snapshots to
enable troubleshooting of memory leaks by changing the options passed into
the heapdump-mocha `use()` function. Modify start-heapdump.ts in each
project to enable heap snapshotting.

## Debugging the CLI and other users of the `adapt/src/ops` module
The `adapt/src/ops` module is unique because it creates a child process to run
the major API functions it exposes. Because that can make debugging more
difficult, you can run everything in the same process by defining the environment
variable:
```
ADAPT_NO_FORK=1
```

## Setting up CI for your fork

1. Create a GitLab CI runner

    To add a new runner on your workspace system (or any Linux system):

        docker run -d --name gitlab-runner --restart always -v /srv/gitlab-runner/config:/etc/gitlab-runner -v /var/run/docker.sock:/var/run/docker.sock gitlab/gitlab-runner:alpine

1. Turn off shared CI/CD runners (if enabled)

    In the GitLab web UI for your fork, go to `Settings > CI/CD > Runners`.
    On the right side, check to see if the shared runners are enabled. If
    they are enabled, click the button to disable them.

1. Supply deployment keys to CI/CD

    1. AWS Credentials

        **You'll need to have AWS credentials handy for this step.**
        For Unbounded employees, get the shared CI AWS credentials from Mark.

        Once you have AWS credentials, go to your fork's web UI:
        `Settings > CI/CD > Variables`.
        You'll need to add the following three variables on this screen:
        * `AWS_ACCESS_KEY_ID`
        * `AWS_SECRET_ACCESS_KEY`
        * `AWS_DEFAULT_REGION`

        Don't forget to save.
        
        **NOTE:**
        If you're using the shared Unbounded CI credentials, `AWS_DEFAULT_REGION`
        **must** be set to `us-west-2` because the credentials only have
        permissions for that region.


    1. Docker Hub Credentials

        **Make sure you completed the Docker Hub Credentials Setup step
        near the top of this doc first.**

        From a Linux shell, run:
        ```
        cat ~/.docker/config.json | tr -d '\n\t'
        ```
        You should get something that looks like this:
        ```
        {"auths": {"https://index.docker.io/v1/": {"auth": "LONGSECRETKEYSTRING="}},"HttpHeaders": {"User-Agent": "Docker-Client/18.06.1-ce (linux)"}}
        ```
        Once you have that, go to your fork's web UI page and navigate to:

        `Settings > CI/CD > Variables`

        Create a new variable:
        * `DOCKER_AUTH_CONFIG`

        Cut and paste the output of the shell command above into the value for
        this new variable and click save.

1. Register the runner to your fork

    Go back to your fork's web UI and find your CI registration token.
    You can find it on the `Settings > CI/CD > Runners` page. On the
    left side, there's a section called `Setup a specific runner manually`
    and the registration token should be there. Copy it and use it in
    this command:

       CI_REGTOKEN=pastetokenhere

    Now run the registration command. This simply modifies the configuration
    file for the runner you already created in step 1. This command will only
    enable your runner to run jobs from your fork.

        docker run --rm -it -v /srv/gitlab-runner/config:/etc/gitlab-runner gitlab/gitlab-runner:alpine register --registration-token="${CI_REGTOKEN}" --non-interactive --url "https://gitlab.com/" --executor docker --docker-image alpine --description "runner-${USER}" --run-untagged --locked=false --docker-privileged

    After you run the registration command, you should be able to see your
    runner listed on the `Settings > CI/CD > Runners` page. Wait for your
    runner's status to turn green. This may take a few minutes and you may
    need to refresh the web page to see the current status.

1. Test it out

    Push to a branch on your fork and you should see the pipeline start
    shortly after.

1. Use the same runner for more repos/forks

    A single runner can run CI for multiple repos and/or multiple forks.
    If you want this runner to run CI for other repos, repeat step 4 using
    the unique registration token for each repo.
