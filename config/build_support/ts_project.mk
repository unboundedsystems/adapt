#
# Default Makefile for TypeScript projects.
#

include $(dir $(lastword $(MAKEFILE_LIST)))/common.mk

# Always run inside Docker
include $(BUILD_SUPPORT)/dockerize.mk
ifeq ($(IN_DOCKER),true)

.NOTPARALLEL:

all: test
.PHONY: all

include $(BUILD_SUPPORT)/node_modules.mk

ADAPT_TMPDIR := $(ADAPT_TMPDIR_BASE)/$(notdir $(CURDIR))

#
# Files
#
TS_SRC_FILES := $(shell find src/ -type f -regex '.*\.tsx?')
TS_TEST_FILES := $(shell find test/ -type f -regex '.*\.tsx?')
TS_FILES := $(TS_SRC_FILES) $(TS_TEST_FILES)
JS_FILES := $(addprefix dist/, $(addsuffix .js, $(basename $(filter-out %.d.ts,$(TS_FILES)))))
DTS_SRC_FILES := $(addprefix dist/, $(addsuffix .d.ts, $(basename $(filter-out %.d.ts,$(TS_SRC_FILES)))))


build: $(NODE_INSTALL_DONE) $(JS_FILES)
.PHONY: build

clean:
	npm run clean
.PHONY: clean

cleaner: clean
	rm -rf node_modules DebugOut .nyc_output
.PHONY: cleaner

$(JS_FILES) $(DTS_SRC_FILES): $(NODE_INSTALL_DONE) $(TS_FILES) tsconfig.json
	npm run build


test: build dist/.test_success
.PHONY: test

dist/.test_success: $(JS_FILES) $(ADAPT_TMPDIR)/.yarnrc
	if [ -f "$(HOME)/.adaptAwsCreds" ]; then cp $(HOME)/.adaptAwsCreds $(ADAPT_TMPDIR); fi
	HOME=$(ADAPT_TMPDIR) npm run test
	touch $@

release-test:
.PHONY: release-test

coverage: build dist/.coverage_success
.PHONY: coverage

dist/.coverage_success: $(JS_FILES)
	npm run coverage
	touch $@
	touch dist/.test_success

lint: $(NODE_INSTALL_DONE) dist/.lint_success
.PHONY: lint

dist/.lint_success: $(TS_FILES) tslint.json $(REPO_ROOT)/config/tslint.json
	npm run lint
	mkdir -p dist
	touch $@

# No additional requirements for prepush besides test and lint (which are
# handled by the top level Makefile)
prepush:
.PHONY: prepush

NPM_PACK_DIR := dist/pack
pack: build
	rm -rf $(NPM_PACK_DIR)
	mkdir $(NPM_PACK_DIR)
	cd $(NPM_PACK_DIR) && npm pack ../..
.PHONY: pack

docs: dist/.docs_success
.PHONY: docs

dist/.docs_success: $(DTS_SRC_FILES) ../scripts/make_docs.js
	npm run docs
	touch $@

$(ADAPT_TMPDIR)/.yarnrc: $(REPO_ROOT)/config/yarnrc_test
	mkdir -p $(ADAPT_TMPDIR)
	cp $(REPO_ROOT)/config/yarnrc_test $(ADAPT_TMPDIR)/.yarnrc

endif # IN_DOCKER
