FROM ghcr.io/nocodenation/liquid-nifi:latest

USER root:root
RUN apt-get --allow-releaseinfo-change update
RUN apt-get install -y python3 python3-pip __SYSTEM_DEPENDENCIES__

# POST_INSTALL_COMMANDS

# ENVIRONMENT_VARIABLES_EXPORTS

COPY --chown=nifi:nifi ./entrypoint.sh /opt/nifi/scripts/entrypoint.sh
COPY --chown=nifi:nifi ./narcheck.py /opt/nifi/scripts/narcheck.py
COPY --chown=nifi:nifi ./nar-watch.sh /opt/nifi/scripts/nar-watch.sh
RUN chmod 775 /opt/nifi/scripts/entrypoint.sh /opt/nifi/scripts/narcheck.py \
              /opt/nifi/scripts/nar-watch.sh
# The load directory, which nothing outside the container writes to. The image
# ships it; it is named here so a future base image without it still works, and
# so the mount that used to land on it is visibly gone from compose.yml.
RUN mkdir -p /opt/nifi/nifi-current/nar_extensions /opt/nifi/nifi-current/nar_inbox \
 && chown nifi:nifi /opt/nifi/nifi-current/nar_extensions /opt/nifi/nifi-current/nar_inbox


USER nifi:nifi

ENTRYPOINT ["/opt/nifi/scripts/entrypoint.sh"]