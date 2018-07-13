#
# Default Makefile for TypeScript projects.
#
all: test
.PHONY: all

#
# Tools
#
NPM := $(abspath $(shell if [ -f /.dockerenv ]; then which npm; else echo ../bin/npm; fi; ))

#
# Files
#
TS_SRC_FILES := $(shell find src/ -type f -regex '.*\.tsx?')
TS_TEST_FILES := $(shell find test/ -type f -regex '.*\.tsx?')
TS_FILES := $(TS_SRC_FILES) $(TS_TEST_FILES)
JS_FILES := $(addprefix dist/, $(addsuffix .js, $(basename $(filter-out %.d.ts,$(TS_FILES)))))

# Don't depend on the timestamp of the actual node_modules directory.
# Depend on the timestamp of a file that says when npm install actually
# last successfully completed
NPM_INSTALL_DONE := node_modules/.install_success


build: $(NPM_INSTALL_DONE) $(JS_FILES)
.PHONY: build

$(NPM_INSTALL_DONE): package.json package-lock.json
	$(NPM) install
	touch $@

clean:
	rm -rf dist
.PHONY: clean

cleaner: clean
	rm -rf node_modules DebugOut
.PHONY: cleaner

$(JS_FILES): $(NPM_INSTALL_DONE) $(TS_FILES) tsconfig.json
	$(NPM) run build


test: build dist/.test_success
.PHONY: test

dist/.test_success: $(JS_FILES)
	$(NPM) run test
	touch $@

lint: $(NPM_INSTALL_DONE) dist/.lint_success
.PHONY: lint

dist/.lint_success: $(TS_FILES)
	$(NPM) run lint
	touch $@

# No additional requirements for prepush besides test and lint (which are
# handled by the top level Makefile)
prepush:
.PHONY: prepush

NPM_PACK_DIR := dist/pack
pack: build
	rm -rf $(NPM_PACK_DIR)
	mkdir $(NPM_PACK_DIR)
	cd $(NPM_PACK_DIR) && $(NPM) pack ../..
.PHONY: pack
