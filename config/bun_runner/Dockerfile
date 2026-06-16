FROM oven/bun:latest

RUN mkdir /bun_app
RUN mkdir /build_info

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /bun_app

ENTRYPOINT ["/entrypoint.sh"]
