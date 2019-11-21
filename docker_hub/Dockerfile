FROM alpine:latest
ARG ADAPT_VERSION
RUN apk --update add --no-cache nodejs npm openssh \
  && rm -rf /var/cache/apk/*
RUN npm install -g @adpt/cli@$ADAPT_VERSION
RUN mkdir /src
VOLUME ["/src"]
WORKDIR /src
ENTRYPOINT ["/usr/bin/adapt"]
