# syntax=docker/dockerfile:1
#Node Base image
FROM node:16.17.0-alpine
#run a simple process supervisor and init system designed to run as PID 1 inside minimal container environments
RUN apk add dumb-init
#defining production environment variable
ENV NODE_ENV=production
#create directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY --chown=node:node package*.json ./
ARG buildtime_MONGODB_HOST=127.0.0.1
ARG buildtime_MONGODB_PORT=2710
ARG buildtime_MONGODB_CDS_SERVICES=cds-services
ARG buildtime_MONGODB_CIG_MODEL=tmr-db
ARG buildtime_MONGODB_NON_CIG_DB=non-cig-db
ARG buildtime_SNOMEDCT=browser.ihtsdotools.org
ARG buildtime_CDS_SERVICES_MS_HOST=127.0.0.1
ARG buildtime_CDS_SERVICES_MS_PORT=3010
ARG buildtime_CDS_SERVICES_MS_PATH=cds-services
ARG buildtime_MONGODB_LOGS_PORT=27017
ARG buildtime_MONGODB_LOGS=logs
ARG buildtime_PROXY_PORT=3000
ENV MONGODB_HOST=${MONGODB_HOST:-$buildtime_MONGODB_HOST}
ENV MONGODB_PORT=${MONGODB_PORT:-$buildtime_MONGODB_PORT}
ENV MONGODB_CDS_SERVICES=${MONGODB_CDS_SERVICES:-$buildtime_MONGODB_CDS_SERVICES}
ENV MONGODB_CIG_MODEL=${MONGODB_CIG_MODEL:-$buildtime_MONGODB_CIG_MODEL}
ENV MONGODB_NON_CIG_DB=${MONGODB_NON_CIG_DB:-$buildtime_MONGODB_NON_CIG_DB}
ENV SNOMEDCT=${SNOMEDCT:-$buildtime_SNOMEDCT}
ENV CDS_SERVICES_MS_HOST=${CDS_SERVICES_MS_HOST:-$buildtime_CDS_SERVICES_MS_HOST}
ENV CDS_SERVICES_MS_PORT=${CDS_SERVICES_MS_PORT:-$buildtime_CDS_SERVICES_MS_PORT}
ENV CDS_SERVICES_MS_PATH=${CDS_SERVICES_MS_PATH:-$buildtime_CDS_SERVICES_MS_PATH}
ENV MONGODB_LOGS_PORT=${MONGODB_LOGS_PORT:-$buildtime_MONGODB_LOGS_PORT}
ENV MONGODB_LOGS=${MONGODB_LOGS:-$buildtime_MONGODB_LOGS}
ENV PROXY_PORT=${PROXY_PORT:-$buildtime_PROXY_PORT}
COPY --chown=node:node . .
USER node
EXPOSE ${PROXY_PORT}
RUN npm ci --only=production
HEALTHCHECK \
    --interval=10s \
    --timeout=5s \
    --start-period=10s \
    --retries=5 \
    CMD curl ${MONGODB_HOST}:${MONGODB_HOST}/_health/ \
    || exit 1
CMD ["dumb-init", "node", "./bin/www"]