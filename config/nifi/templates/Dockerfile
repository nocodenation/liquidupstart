FROM ghcr.io/nocodenation/liquid-nifi:latest

USER root:root
RUN apt-get --allow-releaseinfo-change update
RUN apt-get install -y python3 python3-pip

# POST_INSTALL_COMMANDS

# ENVIRONMENT_VARIABLES_EXPORTS

# Copy custom entrypoint script
COPY --chown=nifi:nifi ./entrypoint.sh /opt/nifi/scripts/entrypoint.sh
RUN chmod 775 /opt/nifi/scripts/entrypoint.sh


USER nifi:nifi

# Set custom entrypoint
ENTRYPOINT ["/opt/nifi/scripts/entrypoint.sh"]