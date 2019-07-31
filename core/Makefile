include ../build_support/ts_project.mk

GQL_SRC_FILES := $(shell find src/ -type f -regex '.*\.graphql')
GQL_TEST_FILES := $(shell find test/ -type f -regex '.*\.graphql')
GQL_FILES := $(GQL_SRC_FILES) $(GQL_TEST_FILES)
GQL_DIST_FILES := $(addprefix dist/, $(GQL_FILES))

$(GQL_DIST_FILES): $(GQL_FILES)
	mkdir -p dist
	tar -cf - $(GQL_FILES) | tar --touch -xvf - -C dist 

build: $(GQL_DIST_FILES)

dist/.docs_success: ../docs/api/core.index.md
