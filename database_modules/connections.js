"use strict";

const mongoose = require('mongoose');
const logger = require("../config/winston");

const {
    MONGODB_CDS_SERVICES_HOST,
    MONGODB_CDS_SERVICES_PORT,
    MONGODB_CDS_SERVICES,
    MONGODB_TMR_DB_HOST,
    MONGODB_TMR_DB_PORT,
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
const db_cds_services_host = ( MONGODB_CDS_SERVICES_HOST || "localhost");
const db_cds_services_port = ( MONGODB_CDS_SERVICES_PORT || "27017" );
const cds_services_db = ( MONGODB_CDS_SERVICES || "cds-services" );
/// TMR CONNECTION
const db_tmr_host = ( MONGODB_TMR_DB_HOST || "localhost");
const db_tmr_port = ( MONGODB_TMR_DB_PORT || "27017" );
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

const servicesConnection = makeNewConnection(`mongodb://${db_cds_services_host}:${db_cds_services_port}/${cds_services_db}`);
const tmrConnection = makeNewConnection(`mongodb://${db_tmr_host}:${db_tmr_port}/${tmr_db}`);

module.exports = {
    servicesConnection,
    tmrConnection
};