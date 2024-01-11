import {} from 'dotenv/config';
import mongoose from "mongoose";
import logger from "../config/winston.js";
import {
  noCIG
} from "../database/constants.js";

const {
  CDS_DISCOVERY_MONGODB_HOST,
GMS_1_MONGODB_HOST,
GMS_2_MONGODB_HOST,
NON_GMS_MONGODB_HOST,
CDS_DISCOVERY_MONGODB_PORT,
NON_GMS_MONGODB_PORT,
GMS_1_MONGODB_PORT,
GMS_2_MONGODB_PORT,
  GMS_1_ID,
  GMS_2_ID
} = process.env;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 8,
  //reconnectTries: Number.MAX_VALUE,
  //reconnectInterval: 500,
  connectTimeoutMS: 10000,
};


//HOST_defaultHOST_default and PORT_default of MONGODB
const HOST_default =  "localhost";
const PORT_default =  "27017";
///CDS SERVICES OFFERED: MONGODB CONNECTION
const cds_discovery_db = "cds-discovery";
/// NON-CIG MODEL: MONGODB CONNECTION
const non_cig_name = noCIG;
//ADD BELOW INTEGRATED CIG FORMALISMS MONGODB
/// TMR MODEL:  MONGODB CONNECTION
const cig_model_name =  GMS_1_ID || "tmr";
const cig_model_2_name = GMS_2_ID  || undefined;
let cigModelNames = (new Array(cig_model_name,cig_model_2_name)).filter( modelName => modelName !== undefined);

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
const cds_discovery_connect = makeNewConnection(
  `mongodb://${CDS_DISCOVERY_MONGODB_HOST? CDS_DISCOVERY_MONGODB_HOST : HOST_default}:${CDS_DISCOVERY_MONGODB_PORT ? CDS_DISCOVERY_MONGODB_PORT : PORT_default}/${cds_discovery_db}`
);

//key-value list of available databases for CDS Services
const connectionsMap = new Map();

//non-cig DB
const nonCigConnection = makeNewConnection(
  `mongodb://${NON_GMS_MONGODB_HOST ? NON_GMS_MONGODB_HOST : HOST_default}:${NON_GMS_MONGODB_PORT ? NON_GMS_MONGODB_PORT : PORT_default}/${non_cig_name}-db`
);
//add new connections to MAP
connectionsMap.set(non_cig_name, nonCigConnection);

//GMS 1
//add new connections to MAP
if(GMS_1_ID){
  connectionsMap.set( GMS_1_ID, makeNewConnection(`mongodb://${GMS_1_MONGODB_HOST ? GMS_1_MONGODB_HOST : HOST_default}:${GMS_1_MONGODB_PORT ? GMS_1_MONGODB_PORT : PORT_default}/${GMS_1_ID}-db`));
}
//GMS 2
//add new connections to MAP
if(GMS_2_ID){
  connectionsMap.set( GMS_2_ID, makeNewConnection(`mongodb://${GMS_2_MONGODB_HOST ? GMS_2_MONGODB_HOST : HOST_default}:${GMS_2_MONGODB_PORT ? GMS_2_MONGODB_PORT : PORT_default}/${GMS_2_ID}-db`));
}

export { cds_discovery_connect, connectionsMap };
