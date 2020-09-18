include ../config/build_support/ts_project.mk

COPY_FILES_SRC := src/docker/docker_swagger.yaml src/aws/cloudformation_swagger.yaml src/aws/ec2_swagger.yaml src/k8s/diff.cmd
COPY_FILES_DIST := $(addprefix dist/, $(COPY_FILES_SRC))

$(COPY_FILES_DIST): $(COPY_FILES_SRC)
	mkdir -p dist
	tar -cf - $(COPY_FILES_SRC) | tar -xvf - -C dist
	touch $(COPY_FILES_DIST)

build: $(COPY_FILES_DIST)

