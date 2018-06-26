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
  && mkdir repo.git \
  && chown -R git:git /home/git \
  && ln -s /home/git/repo.git /repo.git

# patch sshd_config to disable passwords and enable keys
RUN echo "PasswordAuthentication no" >> /etc/ssh/sshd_config 

COPY start.sh post-receive.sh ./

EXPOSE 22

CMD ["sh", "start.sh"]


