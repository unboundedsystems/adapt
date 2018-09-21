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
set of tests to run. This is the set of tests that run in CI.
```
ADAPT_RUN_LONG_TESTS=1 make
```

