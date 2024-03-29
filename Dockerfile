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
ARG buildtime_MONGODB_CIG_MODEL_2=demo
ARG buildtime_MONGODB_NONCIG_DB_NAME=non-cig
ARG buildtime_SNOMEDCT=browser.ihtsdotools.org
ARG buildtime_CDS_SERVICES_MS_HOST=127.0.0.1
ARG buildtime_CDS_SERVICES_MS_PORT=3010
ARG buildtime_LOGS=cds_hm_logs
ARG buildtime_PROXY_PORT=3000
ARG buildtime_REDIS_HOST=127.0.0.1
ARG buildtime_REDIS_PORT=6379
ARG buildtime_TTL_SCT=2628288
ENV REDIS_HOST=${REDIS_HOST:-$buildtime_REDIS_HOST}
ENV REDIS_PORT=${REDIS_PORT:-$buildtime_REDIS_PORT}
ENV MONGODB_HOST=${MONGODB_HOST:-$buildtime_MONGODB_HOST}
ENV MONGODB_PORT=${MONGODB_PORT:-$buildtime_MONGODB_PORT}
ENV MONGODB_NONCIG_DB_NAME=${MONGODB_NONCIG_DB_NAME:-$buildtime_MONGODB_NONCIG_DB_NAME}
ENV MONGODB_CIG_MODEL=${MONGODB_CIG_MODEL:-$buildtime_MONGODB_CIG_MODEL}
ENV MONGODB_CIG_MODEL_2=${MONGODB_CIG_MODEL_2:-$buildtime_MONGODB_CIG_MODEL_2}
ENV SNOMEDCT_BASE_URL=${SNOMEDCT_BASE_URL:-$buildtime_SNOMEDCT}
ENV TTL_SCT=${TTL_SCT:-$buildtime_TTL_SCT}
ENV CDS_SERVICES_MS_HOST=${CDS_SERVICES_MS_HOST:-$buildtime_CDS_SERVICES_MS_HOST}
ENV CDS_SERVICES_MS_PORT=${CDS_SERVICES_MS_PORT:-$buildtime_CDS_SERVICES_MS_PORT}
ENV LOGS=${LOGS:-$buildtime_LOGS}
ENV PROXY_PORT=${PROXY_PORT:-$buildtime_PROXY_PORT}

RUN npm ci --only=production

COPY . .

HEALTHCHECK \
    --interval=10s \
    --timeout=5s \
    --start-period=10s \
    --retries=5 \
    CMD curl -f http://127.0.0.1:${PROXY_PORT}/_health \
    || exit 1

#COPY --chown=node:node . .
#USER node
#EXPOSE 3001
    
CMD ["dumb-init", "node", "./bin/www"]