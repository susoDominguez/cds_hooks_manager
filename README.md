# CDS Hooks Management microservice

#### Deployed at

<img src="Kings_College_London-logo.png" width="150">

#### Integrated with

<img src="heliant_logo.jpeg" width="150">

## Introduction

This code repository contains one of the services that is part of the *Microservice Architecture for Guideline Embedding into Decision Support Systems* (**MAGE-DSS**). In particular, this repository implements the **CDS Hooks Management** (CDS-HsM) **microservice**. The CDS HsM microservice is an agnostic service to implementations of guideline modelling languages. The service functions as the single point of entry between CDS clients (via FHIR and CDS hook specifications) and any implementation of a computable guideline enactment engine.

The CDS-HsM microservice leverages existing CDS hook specifications and computable guidelines knowledge to query the clinical workflow context, part of any CDS-Hooks-compliant CDS request call, to search, and manipulate, clinical and patient data. The result can be as simple as fetching the FHIR patient identifier from the hook context to add it to the CDS suggestion card response (later, as part of the [CDS Services Manager microservice](https://github.com/susoDominguez/cds-services-manager)), or to identify URIs in order to trigger (parts of) implemented computable guidelines, or even to describe more complex algorithms (for instance, we have implemented the COPD severity assessment algorithm form [GOLD 2017 guideline](https://goldcopd.org/wp-content/uploads/2017/02/wms-GOLD-2017-FINAL.pdf) using solely the available actions which are included with this microservice functionality).

## Getting started

This repository is built using either [Docker](https://www.docker.com/) or [NPM](https://www.npmjs.com/). In order to run the microservice locally or build this project, you will need to [install Node ~12.13](https://nodejs.org/en/download/) and [install NPM ~6.13](https://www.npmjs.com/) as well as the database [MongoDb](https://www.mongodb.com/), which contains the collection of instructions loaded to the CDS-HsM service to search and manipulate the clinical workflow context. We strongly recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm) to install Node.js and npm. We do not recommend using a Node installer, since the Node installation process installs npm in a directory with local permissions and can cause permissions errors when you run npm packages globally.

###  Local build

1. Clone the repository

```sh
$ git clone https://github.com/susoDominguez/cds_hooks_manager
```
2. [Install and connect to the MongoDB database](https://www.mongodb.com/) with baseURL `MONGODB_HOST` and port `MONGODB_HOST`. Our default values are `MONGODB_HOST = localhost` and `MONGODB_PORT = 27017`. Alternatively, if the docker daemon is installed, pull and run the [docker official image](https://hub.docker.com/_/mongo), then follow the instructions to add both *host* and *port* values.

```sh
$ docker pull mongo
```

3. [Install SNOWSTORM](https://github.com/IHTSDO/snowstorm), the SNOMED CT terminology server. This services only interacts with the [FHIR API of the SNOWSTORM server](https://github.com/IHTSDO/snowstorm/blob/master/docs/using-the-fhir-api.md).

4. Create the environment `.env` text file, to be located in the main folder of the project

```sh
$ touch .env
$ open .env
```

5. and add the following environment variables (and default values)

```
MONGODB_HOST=localhost
MONGODB_PORT=27017
CDS_SERVICES_MS_HOST=localhost
CDS_SERVICES_MS_PORT=3010
SNOMEDCT_BASE_URL=snowstorm-fhir.snomedtools.org
PROXY_PORT=3000
MONGODB_CIG_MODEL=tmr
MONGODB_NONCIG_DB_NAME=non-cig
LOGS=cds_hm_logs
```
Environment variables `MONGODB_HOST`, `MONGODB_PORT`, `LOGS`, `MONGODB_CIG_MODEL` and `MONGODB_NONCIG_DB_NAME` relate to the instance of the `MongoDB` where `MONGODB_HOST` is the baseURL, `MONGODB_PORT` is the port, `LOGS` is the collection to store system errors, `MONGODB_CIG_MODEL` is the identifier of the computable guideline implementation this service is working with, (could be more than one, then `MONGODB_CIG_MODEL_2`,n etc.) and `MONGODB_NONCIG_DB_MODEL` is collection that stores documents which do not access computable guideline knowledge (for instance, the COPD severity assessment algorithm mentioned above). `PROXY_PORT` is the port used by this service.
`CDS_SERVICES_MS_HOST`, `CDS_SERVICES_MS_PORT` store the baseURL and port of the CDS Services Management (CDS-SsM) microservice implementation this service operates with (at least one CDS-SsM per computable guideline representation model implemented). Next, variables `SNOMEDCT_BASE_URL` store the **FHIR-based API endpoint** of the SNOMED CT server installed.



6. Install the project dependencies

```sh
$ cat requirements.txt | xargs npm install -g
```

7. Run the site locally in DEBUG mode

```sh
$ DEBUG=cds_hooks_manager:* npm run devstart
```

### Dockerised deployment

We offer a dockerised version of this service by building the attached `docker-compose` yaml file.

```sh
$ docker-compose up -d --build
```