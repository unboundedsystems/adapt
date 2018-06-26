FROM alpine:3.7

RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories
RUN apk add --no-cache \
  openssh \
  git \
  etcd-ctl

WORKDIR /home/git

RUN adduser -D -s /usr/bin/git-shell git \
  && echo git:\* | chpasswd -e \
  && mkdir .ssh \
  && chmod 700 .ssh \
  && chown -R git:git /home/git

RUN mkdir /root/.ssh \
  && chmod 700 /root/.ssh \
  && chown -R root:root /root/.ssh

COPY wait.sh ./
RUN chmod 755 wait.sh

CMD ["sh", "wait.sh"]