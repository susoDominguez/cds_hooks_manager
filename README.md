#### Deployed at

<img src="Kings_College_London-logo.png" width="150">

#### Integrated with

<img src="heliant_logo.jpeg" width="150">

# Introduction

This repository contains an implementation of one of the services which is part of the Microservice Architecture for Guideline Embedding into Decision Support Systems (MAGE-DSS). In particular, this code repository implements the CDS Hooks Management (CDS-HsM) microservice. The CDS HsM microservice is a service agnostic to implementations of guideline modelling languages. It functions as the only point of entry between the CDS client (via FHIR and CDS hook specifications) and the computable guideline enactment engine.

This implementation offers an algorithm to identify and aggregate clinical recommendations from one or more TMR-based computable guidelines (CGs) using the context included in the request call made by the [CDS Hooks Manager microservice](https://github.com/susoDominguez/cds_hooks_manager) as well as the knowledge reachable by the API of the 'CG Interaction microservice' which is part of the collection of computable guidelines authoring microservice architecture, where a TMR-based implementation of said architecture can be found in [TMRWebX](https://github.com/susoDominguez/TMRWebX). Furthermore, we have implemented a service that converts knowledge from TMR (both guideline knowledge and information on interactions among the aggregated recommendations), and possibly from an external mitigation service, into a [CDS suggestion card](https://cds-hooks.org/#cds-cards). The algorithm to map TMR to FHIR terms is in the [TMR2FHIRconverter repo](https://github.com/susoDominguez/TMR2FHIRconverter). The mitigation service can be found in the [ABAPlusG repo](https://github.com/susoDominguez/ABAPlusG).

The point of entry for any TMR-based hook is via `baseURL/cds-services/copd-careplan-review/cigModel/tmr`.

The structure of the context taken by the CDS-SsM microservice is as follows:
`[["paramName", {"value": val, "activeCIG";[cigIds]}]]`
where the context list contains mappings, in array form, from parameter labels to JSON objects, where each array has at index 0 the name of the parameter (`paramName`), and at index 1 the JSON object with one fixed parameter labelled as `value`, which has the value associated with `paramName`, and an optional parameter field labelled `activeCIG` which contains a list of computable guideline identifiers which are triggered by the contents of `value`, that is, `value` contains one or more TMR-based subguideline or recommendations identifiers. For those mapping where `activeCIG` is `undefined`, then an implementation of the functionality is expected to be part of the CDS-SsM, except for parameters with label `patientId` and `encounterId` as their implementation is added to any TMR-based hook.


# Getting started

This repository is built using either Docker or [NPM](https://www.npmjs.com/). In order to run the microservice locally or build this project, you will need to [install Node ~12.13](https://nodejs.org/en/download/) and [install NPM ~6.13](https://www.npmjs.com/) as well as the database [MongoDb](https://www.mongodb.com/), which contains the templates to store the response from the `TMRWebX` microservices and the logs of the CDS-SsM microservice. We strongly recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm) to install Node.js and npm. We do not recommend using a Node installer, since the Node installation process installs npm in a directory with local permissions and can cause permissions errors when you run npm packages globally.

###  Local build

1. Clone the repository

```sh
$ git clone https://github.com/susoDominguez/cds-services-manager 
```
2. Create the MongoDB database `tmr-db` in baseURL `MONGODB_HOST` with port `MONGODB_HOST`. Our default values are `MONGODB_HOST = localhost`
and `MONGODB_PORT = 27017`. Alternatively, if the docker daemon is installed, pull and run the [docker official image](https://hub.docker.com/_/mongo).

```sh
$ docker pull mongo
```

3. Add the templates to the `tmr-db` in `MongoDB`. (both template files have the same content. The difference is that one is in JSON array form). The templates can be located in

```sh
$ cd MongoDB_templates
```


4. create the environment `.env` text file, to be located in the main folder of the project

```sh
$ cd ..
$ touch .env
$ open .env
```
5. and add the following environment variables (and default values)

```
MONGODB_HOST=localhost
MONGODB_PORT=27017
LOGS=cds_sm_logs
PORT=3010
INTERACTION_PORT=8888
INTERACTION_HOST=localhost
ARGUMENTATION_ENGINE_URL=aba-plus-g.herokuapp.com/generate_explanations
INTERACTION_DB=tmrweb
MONGODB_TEMPLATES=templates
MONGODB_CIG_MODEL=tmr
TMR_CIG_CREATE=guideline/create
TMR_CIG_DELETE=guideline/delete
TMR_CIG_ADD=guidelines/add
TMR_CIG_GET=guidelines/cig/get
TMR_CIGS_INTERACTIONS=guidelines/interactions
INTERACTION_DB=tmrweb
```
Environment variables `MONGODB_HOST`, `MONGODB_PORT`, `LOGS`, `MONGODB_TEMPLATES` relates to the instance of the `MongoDb` where `MONGODB_HOST` is the baseURL, `MONGODB_PORT` is the port where MongoDb is reachable, `LOGS` is the collection to store system errors, and `MONGODB_TEMPLATES` is the collection that stores the templates used by the service to transfer responses in JSON format from the `TMRWebX` application (and also to transfer input to the mitigation service `ARGUMENTATION_ENGINE_URL`). `PORT` is the port used by this service. `MONGODB_CIG_MODEL` is the identifier (`tmr`) of the modelling language implemented in this instance of the CDS-SsM microservice. This identifier, among other events, supports the finding of the MongoDb collection used by this service (`tmr-db`).
`INTERACTION_HOST`, `INTERACTION_PORT` and `INTERACTION_DB` store the baseURL, port and location of the Interactions service that manages the clinical knowledge. Next, variables `TMR_CIG_CREATE`, `TMR_CIG_DELETE`, `TMR_CIG_ADD`, `TMR_CIG_GET` and `TMR_CIGS_INTERACTIONS` store the API endpoints of the Interaction microservice from `TMRWebX`, to create CGs, delete CGs, add recommendations to CGs, get recommendations from CGs, and find interactions in CGs, respectively.
Finally, `ARGUMENTATION_ENGINE_URL` directs the service to the location where the mitigation service is found. If this env variable is undefined, then the mitigation service is not called and the response CDS card contains at most one FHIR carePlan instance where recommendations are potentially conflictive among them.


6. Install the project dependencies

```sh
$ cat requirements.txt | xargs npm install -g
```

7. Run the site locally in DEBUG mode

```sh
$ DEBUG=dss-road2h:* npm run devstart
```

### Dockerised deployment

We offer a dockerised version of this service by building the attached `docker-compose` yaml file.

```sh
$ docker-compose up -d --build
```