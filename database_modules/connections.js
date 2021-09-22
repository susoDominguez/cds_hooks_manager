"use strict";

const mongoose = require('mongoose');
const logger = require("../config/winston");

const {
    MONGODB_HOST,
    MONGODB_PORT,
    MONGODB_CDS_SERVICES,
    MONGODB_TMR_DB,
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

///CDS SERVICES CONNECTION
const host = ( MONGODB_HOST || "localhost");
const port = ( MONGODB_PORT || "27017" );
const cds_services_db = ( MONGODB_CDS_SERVICES || "cds-services" );
/// TMR CONNECTION
const tmr_db = ( MONGODB_TMR_DB || "tmr-db" );

//create a DB connection
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

//key-value list of CIG Model DBs
let connectionsList = new Map();

//cds services DB
const servicesConnection = makeNewConnection(`mongodb://${host}:${port}/${cds_services_db}`);

//tmr DB
const tmrConnection = makeNewConnection(`mongodb://${host}:${port}/${tmr_db}`);
//add connection with CigId as key
connectionsList.set("tmr",tmrConnection);

module.exports = {
    servicesConnection,
    connectionsList
};