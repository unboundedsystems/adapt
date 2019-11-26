FROM alpine:3.10.3
ARG ADAPT_VERSION

# Install Adapt and its prerequisites.
RUN apk --update add --no-cache nodejs npm openssh-client
RUN npm install -g yarn@~1.19 @adpt/cli@$ADAPT_VERSION

# Setup volumes where users should mount the source root of their project and
# their configuration directory.
RUN mkdir -p /src /root/.local/share/adapt /root/.ssh
VOLUME ["/src", "/root/.local/share/adapt", "/root/.ssh"]

# Default to running Adapt from the mounted source root volume.
WORKDIR /src
ENTRYPOINT ["/usr/bin/adapt"]
