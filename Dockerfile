# syntax=docker/dockerfile:1
#Node Base image
FROM node:16.17.0-alpine
LABEL org.opencontainers.image.authors="jesus.dominguez@kcl.ac.uk"
#run a simple process supervisor and init system designed to run as PID 1 inside minimal container environments
RUN apk add dumb-init
#defining production environment variable
ENV NODE_ENV=production
#create directory
RUN addgroup app && adduser -S -G app app
RUN mkdir /app && chown app:app /app
USER app
#RUN mkdir -p /usr/src/app
WORKDIR /app
#COPY --chown=node:node package*.json ./
COPY package*.json ./
ARG buildtime_MONGODB_HOST=127.0.0.1
ARG buildtime_MONGODB_PORT=2710
ARG buildtime_MONGODB_CIG_MODEL=tmr
ARG buildtime_MONGODB_NON_CIG_DB_NAME=non-cig
ARG buildtime_SNOMEDCT=browser.ihtsdotools.org
ARG buildtime_CDS_SERVICES_MS_HOST=127.0.0.1
ARG buildtime_CDS_SERVICES_MS_PORT=3010
ARG buildtime_MONGODB_LOGS=cds_hooks_logs
ARG buildtime_PROXY_PORT=3000
ENV MONGODB_HOST=${MONGODB_HOST:-$buildtime_MONGODB_HOST}
ENV MONGODB_PORT=${MONGODB_PORT:-$buildtime_MONGODB_PORT}
ENV MONGODB_NON_CIG_DB_NAME=${MONGODB_NON_CIG_DB_NAME:-$buildtime_MONGODB_NON_CIG_DB_NAME}
ENV MONGODB_CIG_MODEL=${MONGODB_CIG_MODEL:-$buildtime_MONGODB_CIG_MODEL}
ENV SNOMEDCT_BASE_URL=${SNOMEDCT:-$buildtime_SNOMEDCT}
ENV CDS_SERVICES_MS_HOST=${CDS_SERVICES_MS_HOST:-$buildtime_CDS_SERVICES_MS_HOST}
ENV CDS_SERVICES_MS_PORT=${CDS_SERVICES_MS_PORT:-$buildtime_CDS_SERVICES_MS_PORT}
ENV MONGODB_LOGS=${MONGODB_LOGS:-$buildtime_MONGODB_LOGS}
ENV PROXY_PORT=${PROXY_PORT:-$buildtime_PROXY_PORT}

RUN npm ci --only=production

COPY . .

#COPY --chown=node:node . .
#USER node
EXPOSE ${PROXY_PORT}

HEALTHCHECK \
    --interval=10s \
    --timeout=5s \
    --start-period=10s \
    --retries=5 \
    CMD curl ${MONGODB_HOST}:${MONGODB_PORT}/_health/ \
    || exit 1
CMD ["dumb-init", "node", "./bin/www"]