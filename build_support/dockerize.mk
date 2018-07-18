#
# Dockerize.mk
# Always runs make inside the Docker container, using bin/make
#

IN_DOCKER := $(shell if [ -f /.dockerenv ]; then echo true; else echo false; fi; )
SCRIPT_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
DMAKE := $(abspath $(SCRIPT_DIR)/../bin/make)
CONTAINIT := $(SCRIPT_DIR)/../containit/containit.sh


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

# Use "+" on the recipe line below to always run the make command inside
# the container (regardless of "-n") so THAT make actually does the processing
# of whatever options.
$(FAKEGOAL): $(CONTAINIT)
	+DOCKER_ARGS="-eMAKEFLAGS=$(MAKEFLAGS)" $(DMAKE) $(MAKECMDGOALS)
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


