# Adapt
This is the repo for the Unbounded Systems Adapt infrastructure description
system.

# Building and Testing
[![pipeline status](https://gitlab.com/unboundedsystems/adapt/badges/master/pipeline.svg)](https://gitlab.com/unboundedsystems/adapt/commits/master)
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

# Setting up CI for your fork

1. Create a GitLab CI runner

    To add a new runner on your workspace system (or any Linux system):

        docker run -d --name gitlab-runner --restart always -v /srv/gitlab-runner/config:/etc/gitlab-runner -v /var/run/docker.sock:/var/run/docker.sock gitlab/gitlab-runner:alpine

1. Turn off shared CI/CD runners (if enabled)

    In the GitLab web UI for your fork, go to `Settings > CI/CD > Runners`.
    On the right side, check to see if the shared runners are enabled. If
    they are enabled, click the button to disable them.

1. Supply deployment keys to CI/CD

    **You'll need to have AWS credentials handy for this step.**
    For Unbounded employees, get the shared CI AWS credentials from Mark.

    Once you have AWS credentials, go to your fork's web UI:
    `Settings > CI/CD > Variables`.
    You'll need to add the following three variables on this screen:
    * `AWS_ACCESS_KEY_ID`
    * `AWS_SECRET_ACCESS_KEY`
    * `AWS_DEFAULT_REGION`
    
    **NOTE:**
    If you're using the shared Unbounded CI credentials, `AWS_DEFAULT_REGION`
    **must** be set to `us-west-2` because the credentials only have
    permissions for that region.

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
