"use strict";

const mongoose = require('mongoose');
const logger = require("../config/winston");

const {
    MONGODB_HOST,
    MONGODB_PORT,
    MONGODB_CDS_SERVICES,
    MONGODB_TMR_DB,
    MONGODB_NON_CIG_DB,
    TREATMENT_SELECT_ROUTE,
    TREATMENT_REVIEW_ROUTE,
    CIGS_MERGE_ROUTE,
    DB_PRECONDITIONS_ROUTE, 
    TEMPLATES,
    TEMPLATES_COPD
  } = process.env;

  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    poolSize: 8,
    //reconnectTries: Number.MAX_VALUE,
    //reconnectInterval: 500,
    connectTimeoutMS: 10000
  };

//create a new DB connection
function makeNewConnection(uri) {

    const db = mongoose.createConnection(uri, options);

    db.on('error', function (error) {
        logger.error.bind(`MongoDB :: connection ${this.name} ${JSON.stringify(error)}`);
        db.close().catch(() => logger.error(`MongoDB :: failed to close connection ${this.name}`));
    });

    db.on('connected', function () {
        mongoose.set('debug', function (col, method, query, doc) {
            logger.info(`MongoDB :: ${this.conn.name} ${col}.${method}(${JSON.stringify(query)},${JSON.stringify(doc)})`);
        });
        logger.info(`MongoDB :: connected ${this.name}`);
    });

    db.on('disconnected', function () {
        logger.info(`MongoDB :: disconnected ${this.name}`);
    });

    return db;
}

//HOST and PORT of DB
const host = ( MONGODB_HOST || "localhost");
const port = ( MONGODB_PORT || "27017" );
///CDS SERVICES DB CONNECTION
const cds_services_db = ( MONGODB_CDS_SERVICES || "cds-services" );
/// TMR DB CONNECTION
const tmr_db = ( MONGODB_TMR_DB || "tmr-db" );
/// NON-CIG DB CONNECTION
const non_cig_db = ( MONGODB_NON_CIG_DB || "non-cig-db" );

//cds services DB
const servicesConnection = makeNewConnection(`mongodb://${host}:${port}/${cds_services_db}`);

//tmr DB
const tmrConnection = makeNewConnection(`mongodb://${host}:${port}/${tmr_db}`);

//non-cig DB
const nonCigConnection = makeNewConnection(`mongodb://${host}:${port}/${non_cig_db}`);

//key-value list of available databases for CDS Services
let connectionsList = new Map();

//add new connections to MAP
connectionsList.set("tmr",tmrConnection);
connectionsList.set("non-cig",nonCigConnection);

module.exports = {
    servicesConnection,
    connectionsList
};