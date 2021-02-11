FROM alpine:3.12.1
ARG ADAPT_VERSION

# Install Adapt and its prerequisites.
RUN apk --update add --no-cache 'nodejs=~12' 'npm=~12' 'openssh-client=~8'
RUN npm install -g yarn@~1.21 @adpt/cli@$ADAPT_VERSION

# Setup volumes where users should mount the source root of their project and
# their configuration directory.
VOLUME ["/src", "/root/.local/share/adapt", "/root/.ssh"]

# Default to running Adapt from the mounted source root volume.
WORKDIR /src
ENTRYPOINT ["/usr/bin/adapt"]
