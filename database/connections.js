import {} from 'dotenv/config';
import mongoose from "mongoose";
import logger from "../config/winston.js";

const {
  MONGODB_HOST,
  MONGODB_PORT,
  MONGODB_CIG_MODEL,
  MONGODB_CIG_MODEL_2,
  MONGODB_CIG_MODEL_3,
  MONGODB_CIG_MODEL_4,
  MONGODB_CIG_MODEL_5,
  MONGODB_NONCIG_DB_NAME,
} = process.env;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  poolSize: 8,
  //reconnectTries: Number.MAX_VALUE,
  //reconnectInterval: 500,
  connectTimeoutMS: 10000,
};


//HOST and PORT of MONGODB
const host = MONGODB_HOST || "localhost";
const port = MONGODB_PORT || "27017";
///CDS SERVICES OFFERED: MONGODB CONNECTION
const cds_services_db = "cds-services";
/// NON-CIG MODEL: MONGODB CONNECTION
const non_cig_name = MONGODB_NONCIG_DB_NAME || "non-cig";
//ADD BELOW INTEGRATED CIG FORMALISMS MONGODB
/// TMR MODEL:  MONGODB CONNECTION
const cig_model_name =    MONGODB_CIG_MODEL || "tmr";
const cig_model_2_name = MONGODB_CIG_MODEL_2  || undefined;
const cig_model_3_name = MONGODB_CIG_MODEL_3  || undefined;
const cig_model_4_name = MONGODB_CIG_MODEL_4  || undefined;
const cig_model_5_name = MONGODB_CIG_MODEL_5  || undefined;
let cigModelNames = new Array(cig_model_name,cig_model_2_name,cig_model_3_name,cig_model_4_name,cig_model_5_name);
//logger.info('env is ' + JSON.stringify(process.env));

//create a new DB connection
function makeNewConnection(uri) {
   
  const db = mongoose.createConnection(uri, options);

  db.on("error", function (error) {
    logger.error.bind(
      `MongoDB :: connection ${this.name} ${JSON.stringify(error)}`
    );
    db.close().catch(() =>
      logger.error(`MongoDB :: failed to close connection ${this.name}`)
    );
  });

  db.on("connected", function () {
    mongoose.set("debug", function (col, method, query, doc) {
      logger.info(
        `MongoDB :: ${this.conn.name} ${col}.${method}(${JSON.stringify(
          query
        )},${JSON.stringify(doc)})`
      );
    });
    logger.info(`MongoDB :: connected ${this.name}`);
  });

  db.on("disconnected", function () {
    logger.info(`MongoDB :: disconnected ${this.name}`);
  });

  return db;
}

//cds services DB
const servicesConnection = makeNewConnection(
  `mongodb://${host}:${port}/${cds_services_db}`
);

//key-value list of available databases for CDS Services
let connectionsList = new Map();

//non-cig DB
const nonCigConnection = makeNewConnection(
  `mongodb://${host}:${port}/${non_cig_name}-db`
);
//add new connections to MAP
connectionsList.set(MONGODB_NONCIG_DB_NAME, nonCigConnection);

//ADD BELOW INTEGRATED CIG FORMALISMS MONGODB CONNECTION
cigModelNames.forEach( modelName => {
  if(typeof modelName !== 'undefined'){
    //CIG model DB
    let cig_model_connection = makeNewConnection(
      `mongodb://${host}:${port}/${modelName}-db`
    );
      //add cig formalism connection to list
    connectionsList.set(modelName, cig_model_connection);
  }
})


export { servicesConnection, connectionsList };
