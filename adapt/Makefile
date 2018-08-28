include ../build_support/ts_project.mk

GQL_SRC_FILES := $(shell find src/ -type f -regex '.*\.graphql')
GQL_TEST_FILES := $(shell find test/ -type f -regex '.*\.graphql')
GQL_FILES := $(GQL_SRC_FILES) $(GQL_TEST_FILES)
GQL_DIST_FILES := $(addprefix dist/, $(GQL_FILES))

$(GQL_DIST_FILES): $(GQL_FILES) tsconfig.json
	mkdir -p dist
	tar -cf - $(GQL_FILES) | tar -xvf - -C dist 

build: $(GQL_DIST_FILES)
