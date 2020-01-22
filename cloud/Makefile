include ../config/build_support/ts_project.mk

COPY_FILES_SRC := src/docker/docker_swagger.yaml src/aws/cloudformation_swagger.yaml src/aws/ec2_swagger.yaml
COPY_FILES_DIST := $(addprefix dist/, $(COPY_FILES_SRC))

$(COPY_FILES_DIST): $(COPY_FILES_SRC)
	mkdir -p dist
	tar -cf - $(COPY_FILES_SRC) | tar --touch -xvf - -C dist

build: $(COPY_FILES_DIST)

