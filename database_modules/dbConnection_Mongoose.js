"use strict";

const mongoose = require("mongoose");
const logger = require("../config/winston");

const {
  MONGODB_HOST,
  MONGODB_PORT,
  MONGODB_DB,
  TREATMENT_SELECT_ROUTE,
  TREATMENT_REVIEW_ROUTE,
  CIGS_MERGE_ROUTE,
  DB_PRECONDITIONS_ROUTE, 
  TEMPLATES,
  TEMPLATES_COPD,
  CDS_SERVICES
} = process.env;

const {paramSchema, templateSchema, cdsServiceSchema} = require("./mongoose_schemas");


const db_host = ( MONGODB_HOST || "localhost");
const db_port = ( MONGODB_PORT || "27017" );
const db_name = ( MONGODB_DB || "road2h" );

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  poolSize: 8,
  //reconnectTries: Number.MAX_VALUE,
  //reconnectInterval: 500,
  connectTimeoutMS: 10000
};

const url = `mongodb://${db_host}:${db_port}/${db_name}`;
//const url = `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${db_host}:${db_port}/${db_name}?authSource=admin`;

//constant to convert route label to DB collection label
const params = '-params';

//Below we instantiate each pre-defined Collection with its associated model

//linked to the template collection
const Template = mongoose.model("Template", templateSchema, (TEMPLATES || "dss-templates"));
//specific for COPD
const Template_copd = mongoose.model("Template_copd", templateSchema, (TEMPLATES_COPD || "dss-templates_copd"));
//schema for a CDS hook
const HookSchema = mongoose.model("Hook", cdsServiceSchema, CDS_SERVICES || "cds-services");

//add all models to an array of Models
let modelArray = [Template,Template_copd];
let _conn;

  /**
   *  Mongo utility to connect to client
   */
module.exports = {
  
  initDb : () => {
    const _db = mongoose
                .connect(url, options);

     _conn = mongoose.connection;

    _conn.on("error", () => {
      logger.error.bind(logger, "Connection error");
    });
    _conn.once("open", () => console.log("db connection open"));
    _conn.once("connected", () => {
      console.log("Connection Established");
    });

    return _db;
  },
  modelArray,
  HookSchema,
  /***
   * @returns {mongoose.Connection}
   */
  getConn : (collection) => {
    return _conn;
  },
  getModel : (path) => {
    return mongoose.model("fetchTemplate", paramSchema, path);
  }
}


