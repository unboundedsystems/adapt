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

# Setting up CI for your fork

1. Supply deployment keys to CI/CD

    Go to `Settings > CI/CD > Variables`. Add `AWS_ACCESS_KEY_ID`,
    `AWS_DEFAULT_REGION`, and `AWS_SECRET_ACCESS_KEY`.

1. Turn off shared runners

    In the web UI for your fork, go to `Settings > CI/CD > Runners`. On the right side,
    click the button to disable shared runners, if they're not already disabled.

1. Locate the registration token

    While you're on the `Runners` settings, find the `Setup a specific runner
    manually` section and note the registration token. You'll need that
    in the registration step in a moment.

1. Create a runner

    To add a new runner on your workspace system (or any Linux system):

        docker run -d --name gitlab-runner --restart always -v /srv/gitlab-runner/config:/etc/gitlab-runner -v /var/run/docker.sock:/var/run/docker.sock gitlab/gitlab-runner:alpine

1. Register the runner to your fork

    Run the command line below, substituting the registration token you
    located earlier. This registers the runner to take jobs from only
    your fork of the repo.
    
        docker run --rm -it -v /srv/gitlab-runner/config:/etc/gitlab-runner gitlab/gitlab-runner:alpine register --non-interactive --url "https://gitlab.com/" --executor docker --docker-image alpine --description "runner-${USER}" --run-untagged --locked=false --docker-privileged --registration-token="TOKEN-FROM-YOUR-FORK-CI-SETTINGS"

    You may need to refresh the `Settings > CI/CD > Runners` page to verify
    that your new runner has status green.

    A single runner can run CI for multiple repos.
    If you want this runner to run CI for other repos, repeat this step 
    with the registration token for each repo.

1. Push to a branch on your fork and you should see the pipeline start
    shortly after.
