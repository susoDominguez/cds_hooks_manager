FROM node:lts-alpine@sha256:76badf0d0284ad838536d49d8a804988b4985fc6bc7242dfff4f8216c851438b
RUN apk add dumb-init
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY --chown=node:node package*.json ./
RUN npm ci --only=production
COPY --chown=node:node . .
#RUN cat addPackages.txt | xargs npm install
USER node
EXPOSE 3000
CMD ["dumb-init", "node", "./bin/www"]