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

//available schemas
const {paramSchema, templateSchema, cdsServiceSchema} = require("./mongoose_schemas");


const db_host = ( MONGODB_HOST || "localhost");
const db_port = ( MONGODB_PORT || "27017" );
const db_name = ( MONGODB_DB || "cds-services" );

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

//Below we instantiate each pre-defined Collection with its associated model

//linked to the template collection
//const Template = mongoose.model("Template", templateSchema, (TEMPLATES || "dss-templates"));
//specific for COPD
//const Template_copd = mongoose.model("Template_copd", templateSchema, (TEMPLATES_COPD || "dss-templates_copd"));
//schema for a CDS hook
let CdsServiceModel ;//= mongoose.model("Service", cdsServiceSchema, CDS_SERVICES || "cds-services");

//add all models to an array of Models
//let modelArray = [Template,Template_copd];
let services_conn;

  /**
   *  Mongo utility to connect to client
   */
module.exports = {
  
  initDb : () => {
   // const _db = mongoose.connect(url, options);
       services_conn = mongoose.createConnection(url, options);

     //_conn = mongoose.connection;
     CdsServiceModel = services_conn.model("Cds-service", cdsServiceSchema);
    
     services_conn.on("error", () => {
      logger.error.bind(logger, "cds-services Connection error");
    });
    services_conn.once("open", () => console.log("cds-services db connection open"));
    services_conn.once("cds-services connected", () => {
      console.log("cds-services Connection Established");
    });

    return services_conn;
  },

  //modelArray,

  HookSchema: CdsServiceModel,
  
  /***
   * @returns {mongoose.Connection}
   */
  getServicesConn : () => {
    return services_conn;
  },
  getServicesModel : (conn) => {
    //return Model for any hook where the hook id given in the route is the name of the collection on the DB
    return 
  }
}


