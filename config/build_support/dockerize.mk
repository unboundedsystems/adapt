#
# Dockerize.mk
# Always runs make inside the Docker container, using bin/make
#

ifeq ($(IS_WINDOWS),true)
    # Don't use Docker for make on Windows
    IN_DOCKER := true
else
    IN_DOCKER := $(shell if [ -f /.dockerenv ]; then echo true; else echo false; fi; )
endif
DMAKE := $(REPO_ROOT)/bin/make
CONTAINIT := $(REPO_ROOT)/bin/containit/containit.sh


ifeq ($(IN_DOCKER),false)

ifeq ($(MAKECMDGOALS),)
FAKEGOAL := all

else
FAKEGOAL := $(firstword $(MAKECMDGOALS))

# For any other goals on the command line, THIS make will ignore, but we
# still pass them to the make inside docker to act on.
OTHERGOALS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
$(OTHERGOALS):
.PHONY: $(OTHERGOALS)
endif # MAKECMDGOALS

# The target $(DOCKER_MAKE_DONE) can be used as a prerequisite for any
# rules which want to ensure that the containerized make has completed first.
# It's only defined in the outer (non-Docker) make, so is a no-op
# prerequisite in the inner make.
DOCKER_MAKE_DONE:=.DOCKER_MAKE_DONE

# Use "+" on the recipe line below to always run the make command inside
# the container (regardless of "-n") so THAT make actually does the processing
# of whatever options.
$(DOCKER_MAKE_DONE): $(CONTAINIT)
	+DOCKER_ARGS="-eMAKEFLAGS=$(MAKEFLAGS)" $(DMAKE) $(MAKECMDGOALS)
.PHONY: $(DOCKER_MAKE_DONE)

$(FAKEGOAL): $(DOCKER_MAKE_DONE)
.PHONY: $(FAKEGOAL)

endif # IN_DOCKER==false

# Because this file gets included pretty much before anything else,
# the CONTAINIT rule below might be the very first rule...making it the
# default goal. So, the code below sets the default goal to something
# more conventional and expected. Ugly.
ifeq ($(.DEFAULT_GOAL),)
    .DEFAULT_GOAL=all
endif

# This happens outside of docker
$(CONTAINIT):
	git submodule update --init --recursive


