"use strict";

const tmr2fhir = require("../TMR2FHIRconverter/tmr2fhir-component");
const tmr2fhir_noArg = require("../TMR2FHIRconverter/tmr2fhir_noArg");
const param2fhir = require("../TMR2FHIRconverter/param2fhir");

const logger = require("../config/winston");
const axios = require("axios");
const qs = require("querystring");

const {
  TMR_CIG_CREATE,
  TMR_CIG_DELETE,
  TMR_CIG_ADD,
  TMR_CIG_GET,
  TMR_CIGS_INTERACTIONS,
  ARGUMENTATION_ENGINE_URL,
  TMR_HOST,
  TMR_PORT,
  TMR_DB,
} = process.env;

const {
  paramName,
  labelTemplate,
  bodyTemplate,
  addTemplate,
  patientId,
  fields,
  aPath,
  entryField,
  entryTemplate,
  datalist,
  ciglist,
} = require("../database_modules/constants.js");

//building interaction Web service URL
const dmims_host = TMR_HOST;
const dmims_port = TMR_PORT;

//configuration for request call
let config = {
  method: "post",
  url: "",
  headers: {
    "Content-Type": "",
  },
  data: "",
};

//create a non persistent dataset in Jena using Fuseki
/**
 *
 * @param {Map} paramMap MAp containing paramaters from DB with cporresponding values
 * @param {string} cigPath path to CIG engine
 * @returns
 */
async function callCigInteractionComponent(paramMap, CIGlist, cigPath) {
  //convert Mapt to JSON for request call transfer
  let paramJSON = Object.fromEntries(paramMap);

  let data = qs.stringify({
    args: paramJSON,
    CIGList: CIGlist,
  });

  let configCreate = JSON.parse(JSON.stringify(config));
  configCreate.url = "http://" + dmims_host + ":" + dmims_port + "/" + cigPath;
  configCreate.headers["Content-type"] = "application/x-www-form-urlencoded";
  configCreate.data = data;

  return axios(config);
}

/**
 *
 * @param {Object} CIGform form with recommendations and interactions among them
 * @returns
 */
async function callResolutionEngine(CIGform) {
  let configArgEngine = JSON.parse(JSON.stringify(config));
  configArgEngine.url = resolution_url;
  configArgEngine.headers["Content-type"] = "application/json";
  configArgEngine.data = CIGform;

  return axios(configArgEngine);
}

exports.aggregateData = function (req, res, next) {
  //which CIG formalism is being used, if any
  const cigEngine = res.locals.cigEngine || null;
  //which service is being requested -either careplan-select or any other user-defined service
  const cdsService = res.locals.path;

  //FHIR response
  let dss_response = [];
  let patientId = "dummyPatient";

  //GET patient ID
  if (res.locals.parametersMap.has(patientId)) {
    let { dataList, cigList } = res.locals.parametersMap.get(patientId);
    //list can only be of size 1
    patientId = dataList[0];
    logger.info(`patient is ${patientId}`);
  }

  //if no cigEngine use actual name of CDS service
  let service = !cigEngine ? cigEngine : cdsService;

  //response from CIG tool
  let cigResponse = null;

  try {
    //find CIG engine being used or non -ontology-based service
    switch (service) {
      //user-defined CDS services beyond the automated CIG interaction one
      case "copd-assess":
        //nothing to do
        break;
      //if there is a CIG interaction tool available, call the general function
      default:
        break;
    }

    //Now add extra requests to tools such as conflict mitigation, etc

    if (cigEngine) {
      switch (cigEngine) {
        case "tmr":
          callResolutionEngine(cigObject);
          //create argumentation request
          let reqBodyTemplateMap = new Map();
          let templateActionsMap = new Map();
          break;
      }
    }
  } catch (err) {
    logger.error("calling cds service error " + err);
    next(err);
  }

  //data aggregation:
  // if no engine then cds service is used instead
  switch (service) {
    case "copd-assess":
      dss_response = param2fhir.setCdsCard_medPrefs(
        patientId,
        res.locals.cdsData.copdGroupsObj,
        res.locals.cdsData.assessedCopdGroup_code
      );
      break;
    //default case is for TMR
    default:
      if (cdsService === "copd-careplan-select") {
        dss_response = tmr2fhir.setCdsCard(
          patientId,
          cigId,
          cigObject,
          res.locals.cdsData.argumentation
        );
      } else {
        //wrap response into cards
        dss_response = tmr2fhir_noArg.setCdsCard(patientId, cigId, cigObject);
      }
      break;
  }

  //save to send to ehr
  res.locals.cdsData = dss_response;

  next();
};
