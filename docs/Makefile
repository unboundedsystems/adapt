include ../build_support/common.mk

# Always run inside Docker
include $(BUILD_SUPPORT)/dockerize.mk
ifeq ($(IN_DOCKER),true)

include $(BUILD_SUPPORT)/local_registry.mk

export HOSTCURL:=$(REPO_ROOT)/docs/test/hostcurl.sh

ifeq ($(call to_bool,$(ADAPT_RELEASE_TESTS)),true)
DOCS_REGISTRY:=$(ADAPT_PRERELEASE_REGISTRY)
else
DOCS_REGISTRY:=$(ADAPT_TEST_REGISTRY)
endif


LONG_TESTS:=$(call to_bool,$(ADAPT_RUN_LONG_TESTS))
ifeq ($(LONG_TESTS),true)
# For debugging, use the following command instead:
#CLITEST:=NPM_CONFIG_REGISTRY=$(DOCS_REGISTRY) DEBUG=clitest:output,clitest:commands markdown-clitest --no-cleanup
CLITEST:=NPM_CONFIG_REGISTRY=$(DOCS_REGISTRY) markdown-clitest
LT_TOUCH:=touch
else
CLITEST:=echo "Skipping test of"
LT_TOUCH:=@echo "Skipping touch"
endif

# Uncomment to enable debug output during doc testing
#export DEBUG:=clitest:output,clitest:commands

.NOTPARALLEL:

all: test
.PHONY: all

build:
.PHONY: build

clean:
	rm -rf dist */.test-success
.PHONY: clean

cleaner: clean
.PHONY: cleaner

test: dist/.test-success
.PHONY: test

# Release testing runs the same tests, but CI sets different env variables
release-test: dist/.test-success
.PHONY: release-test

MD_TEST_DIRS := getting_started tutorial_concepts tutorial-action

dist/.test-success: $(addsuffix /.test-success,$(MD_TEST_DIRS))
	mkdir -p dist
	$(LT_TOUCH) $@

GS_FILES := $(shell find getting_started -type f -regex '.*\.md')
# The GSG does a global NPM install. In order to not ACTUALLY do a global
# install, create a temp directory and set PREFIX so npm installs there.
getting_started/.test-success: $(GS_FILES)
	PREFIX=$$(mktemp -d adapt-doc-gsg-XXXX --tmpdir) PATH="$${PREFIX}/bin:$(PATH)" $(CLITEST) getting_started
	$(LT_TOUCH) $@

CONCEPTS_FILES := $(shell find tutorial_concepts -type f -regex '.*\.md')
tutorial_concepts/.test-success: $(CONCEPTS_FILES)
	$(CLITEST) tutorial_concepts
	$(LT_TOUCH) $@

ACTION_FILES := $(shell find tutorial-action -type f -regex '.*\.md')
tutorial-action/.test-success: $(ACTION_FILES)
	$(CLITEST) tutorial-action
	$(LT_TOUCH) $@

coverage: test
.PHONY: coverage

lint:
.PHONY: lint

prepush:
.PHONY: prepush

pack:
.PHONY: pack

docs: dist/.docs_success
.PHONY: docs

dist/.docs_success:
	mkdir -p dist
	touch $@

endif # IN_DOCKER
