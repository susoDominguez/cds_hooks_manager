"use strict";

const axios = require("axios");
const qs = require("querystring");
//const merge = require("deepmerge");
const logger = require("../../config/winston");
const {
  TMR_CIG_CREATE,
  TMR_CIG_DELETE,
  TMR_CIG_ADD,
  TMR_CIG_GET,
  TMR_CIGS_INTERACTIONS,
  ARGUMENTATION_ENGINE_URL,
  TEMPLATES_COPD,
  TMR_HOST,
  TMR_PORT,
  TMR_DB
} = process.env;
const { modelArray } = require("../../database_modules/dbConnection_Mongoose");
//instantiate Mongoose model. share with other modules
const Model = modelArray.find(
  (model) => model.collection.collectionName === TEMPLATES_COPD
);

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
  datalist, ciglist
} = require("../../database_modules/constants.js");


//building TMR Web URL
const tmr_host = TMR_HOST;
const tmr_port = TMR_PORT;
const tmr_db = TMR_DB;
const tmr_url = "http://" + tmr_host + ":" + tmr_port + "/" + tmr_db;

//endpoints
const tmr_cig_create = TMR_CIG_CREATE;
const tmr_cig_delete = TMR_CIG_DELETE;
const tmr_cig_add = TMR_CIG_ADD;
const tmr_cig_get = TMR_CIG_GET;
const tmr_cigs_interactions = TMR_CIGS_INTERACTIONS;

//argumentation engine
const resolution_url = "https://" + ARGUMENTATION_ENGINE_URL;
//config template

let config = {
  method: "post",
  url: "",
  headers: {
    "Content-Type": ""
  },
  data: ""
};

//create a non persistent dataset in Jena using Fuseki
async function createCigRemotely() {

  let data = qs.stringify({
    cig_id: Date.now(),
    IsPersistent: "false",
  });

  let configCreate = JSON.parse(JSON.stringify(config));
  configCreate.url = tmr_url + "/" + tmr_cig_create;
  configCreate.headers["Content-type"] = "application/x-www-form-urlencoded";
  configCreate.data = data;

  return axios(config).then(function (response) {
  console.log(JSON.stringify(response.data));
  return response
})
.catch(function (error) {
  console.log(error);
});;
}

//delete a non persistent dataset in Jena using Fuseki
async function deleteCigRemotely(cig_id) {
  let data = qs.stringify({
    cig_id: cig_id,
  });

  let configDelete = JSON.parse(JSON.stringify(config));
  configDelete.url = tmr_url + "/" + tmr_cig_delete;
  configDelete.headers["Content-type"] = "application/x-www-form-urlencoded";
  configDelete.data = data;

  //delete. If it does not succeed is Ok as labels are unique so there will be no clashing with other temporary datasets
  return axios(configDelete);
}

async function addSubCigs(cig_from, cig_to, subCigs) {

  let data = qs.stringify({
    cig_from: cig_from,
    cig_to: cig_to,
    //subCIGs could be empty array
    subguidelines: subCigs.toString()
  });

  let configAdd = JSON.parse(JSON.stringify(config));
  configAdd.url = tmr_url + "/" + tmr_cig_add;
  configAdd.headers["Content-type"] = "application/x-www-form-urlencoded";
  configAdd.data = data;

  return axios(configAdd);
}

async function getInteractions(cig_id) {
  let data = qs.stringify({
    cig_id: cig_id,
  });

  let configInter = JSON.parse(JSON.stringify(config));
  configInter.url = tmr_url + "/" + tmr_cigs_interactions;
  configInter.headers["Content-type"] = "application/x-www-form-urlencoded";
  configInter.data = data;

  return axios(configInter);
}

async function getTempCig(cig_id) {
  let data = qs.stringify({
    cig_id: cig_id,
  });

  let configRecs = JSON.parse(JSON.stringify(config));
  configRecs.url = tmr_url + "/" + tmr_cig_get;
  configRecs.headers["Content-type"] = "application/x-www-form-urlencoded";
  configRecs.data = data;

  return axios(configRecs);
}

async function callResolutionEngine(argsObj) {
  //let data = JSON.stringify(argsObj);

  let configArgEngine = JSON.parse(JSON.stringify(config));
  configArgEngine.url = resolution_url;
  configArgEngine.headers["Content-type"] = "application/json";
  configArgEngine.data = argsObj;

  return axios(configArgEngine);
}

/**
 * Given a list of paths, walk through object until encounter last given field then add value to it
 * @param {Array} pathList list of path objects to traverse
 * @param {object} val any value, including arrays
 * @param {object} queryObj object to be updated at paths with value(s)
 */
function traverseAndUpdateObjectWithPath(pathList, val, queryObj) {
  //for each path, act (check whether acting on array)
  for (const aPathObject of pathList) {
    //check it has the field
    if (aPathObject.hasOwnProperty(aPath)) {
      //get String path from the Object labeleed as constant 'aPath' determines
      let aPathString = aPathObject[aPath];
      //split string at dots into a comma separated list of fields to traverse
      let propertyList = aPathString.split(".");

      //json object to iterate over
      let aField = queryObj;

      //loop over properties of query object until the last one. Dont traverse the last one
      for (let index = 0; index < propertyList.length - 1; index++) {
        //property to traverse
        const propLabel = propertyList[index];

        if (aField.hasOwnProperty(propLabel)) {
          aField = aField[propLabel];
         // logger.info(`aField currently is ${JSON.stringify(aField)}`);
        } else {
          logger.error(
            `Name ${propLabel} of property is not found in the given object ${JSON.stringify(
              queryObj
            )} at function traverseAndUpdateObjectWithPath`
          );
          throw `Name ${propLabel} of property is not found in the given object ${JSON.stringify(
            queryObj
          )} at function traverseAndUpdateObjectWithPath`;
        }
      }

      //Now add value to the last property in the list 
      let lstPropLabel = propertyList[propertyList.length - 1];

      if (aField.hasOwnProperty(lstPropLabel)) {
       // logger.info(`aField currently is ${JSON.stringify(aField[lstPropLabel])}`);
         //add value to field depending on the type of field.
      //If arrray, test whether value to be added is also array. If so, join arrays instead of replacing.
      if (Array.isArray(aField[lstPropLabel])) {
        if (Array.isArray(val)) {
          //if empty, avoid concat
          if (val === []) {
            aField[lstPropLabel] = val;
          } else {
            aField[lstPropLabel] = aField[lstPropLabel].concat(val);
          }
        } else {
          aField[lstPropLabel].push(val);
        }
      } else {
        //if a string
        if (typeof aField[lstPropLabel] === "string") {
          //if string is not empty or null or undefined
          aField[lstPropLabel] ? (aField[lstPropLabel] += val) : (aField[lstPropLabel] = val);
        }
      }
      } else {
        logger.error(
          `Name ${lstPropLabel} of property is not found in the given object ${JSON.stringify(
            queryObj
          )} at function traverseAndUpdateObjectWithPath`
        );
        throw `Name ${lstPropLabel} of property is not found in the given object ${JSON.stringify(
          queryObj
        )} at function traverseAndUpdateObjectWithPath`;
      }

    } else {
      logger.error(
        "traverseAndUpdateObjectWithPath: object has no aPath constant labelled as " +
          aPath
      );
      throw Error(
        "traverseAndUpdateObjectWithPath: object has no aPath constant labelled as " +
          aPath
      );
    }
  }
}

//apply cig-specific functions to outcome data
function setDataTemplateArgumentation(
  { cigId, recommendations, interactions },
  parameterMap,
  updateFieldsArr,
  reqBodyTemplate
) {
  //loop over parameters
  for (const obj of updateFieldsArr) {
    //template vars
    let paramLabelTemplate = obj[paramName];
    let fieldList = obj[fields];
    //label of field
    let entry_field = null;
    //object to be filled in with data
    let entry_templ = null;

    if (obj.hasOwnProperty(entryField) && obj.hasOwnProperty(entryTemplate)) {
      entry_templ = obj[entryTemplate];
      entry_field = obj[entryField];
    }
    
    //FHIR-based extracted data: vars
    let paramLabelData,
      resultObj,
      dataArr;
    //value to be added
    let val;

    switch (paramLabelTemplate) {
      //add cig id to template
      case "id":
        //value to be added
        val = cigId;
        break;

      case "interactions":
        //value to be added
        val = interactions;
        break;

      case "copd-group":
        //parameter label
        paramLabelData = "selected_copd_group";
        //get obj from Map
        resultObj = parameterMap.get(paramLabelData);
        //logger.info(JSON.stringify(resultObj));
        //get data from field dataList
        dataArr = resultObj[datalist];
        //value to be added
        //only item on list. last char on string (e.g., copd_group_B)
        val = dataArr[0].slice(-1);
        break;

      case "medications_user_preference":
        //parameter label
        paramLabelData = "medications_user_selection";
        //get obj from Map
        resultObj = parameterMap.get(paramLabelData);
        //get data from field dataList
        dataArr = resultObj[datalist];

        if (Array.isArray(dataArr)) {
          //for this case, we know that, by looking at DB form, dataArr[[all DSS suggested drugs],[selected drugs]]
          var selectedDrugs = dataArr[1];
          var allButSelectedDrugs = dataArr[0];
          logger.info(`selectedDrugs is ${JSON.stringify(selectedDrugs,3)}`);
          logger.info(`all but selected Drugs is ${JSON.stringify(allButSelectedDrugs,3)}`);
          logger.info(`entry_field is ${JSON.stringify(entry_field)}`);
          logger.info(`entry_templ is ${JSON.stringify(entry_templ)}`);
          if (
            Array.isArray(selectedDrugs) && Array.isArray(allButSelectedDrugs) &&
            entry_field &&
            entry_templ
          ) {
            //modify allDrugs array
            allButSelectedDrugs.forEach(function (elem, index) {
              var temp = {};
              temp[entry_field] = elem;
              this[index] = temp;
            }, allButSelectedDrugs);

            //create preference list
            selectedDrugs.forEach(function (elem, index) {
              var temp = {};
              temp[entry_field] = elem;

              var tempTemplate = JSON.parse(JSON.stringify(entry_templ));

              if (
                tempTemplate.hasOwnProperty("preferred") &&
                tempTemplate.hasOwnProperty("alternative")
              ) {
                tempTemplate["preferred"] = temp;
                tempTemplate["alternative"] = allButSelectedDrugs;
                this[index] = tempTemplate;
              } else {
                logger.error(
                  "Property labels preferred or alternative are missing from object entry_template taken from template DB"
                );
                throw Error(
                  "Property labels preferred or alternative are missing from object entry_template taken from template DB"
                );
              }
            }, selectedDrugs);

            //value to be added
            val = selectedDrugs;
          } else
            throw Error(
              `selectedDrugs is ${JSON.stringify(selectedDrugs,3)} and all but selected Drugs is ${JSON.stringify(allButSelectedDrugs,3)}
              and entry_field is ${JSON.stringify(entry_field)} and entry_templ is ${JSON.stringify(entry_templ)}`
            );
        } else
          throw Error(
            "dataList result is not of type Array in form medications_user_preference"
          );
        break;

      default:
        //value to be added for recommendations case
        val = recommendations;
        break;
        break;
    }
   // logger.info(`setDataTemplateArgumentation: fieldList is ${JSON.stringify(fieldList)} with value ${JSON.stringify(val)} and object ${JSON.stringify(reqBodyTemplate)}`);
       //add value to object
    traverseAndUpdateObjectWithPath(fieldList, val, reqBodyTemplate);
  }
}

exports.fetchTmrData_copd = async function (req, res, next) {
  //list of CIGs to extract info from
  const involvedCIGList = res.locals.cigInvolvedList;

  //map with parameters and their extracted values
  const parametersMap = res.locals.parametersMap;

  //if collection name is not found, throw error
  if (!Model)
    throw Error(
      "Model collection name is undefined or there is a typo as it could not be found"
    );

  /////////////////// extract patient identifier

  //response object to contain data which will be pass to the next middleware (cigId | patientId | TMR json object | argumentation JSON object)
  res.locals.cdsData = {
    patientId: undefined,
    cigId: undefined,
    tmrObject: undefined,
    argumentation: undefined,
  };

  if (parametersMap.has(patientId)) {
    let { dataList, cigList } = parametersMap.get(patientId);
    res.locals.cdsData[patientId] = dataList[0];
    logger.info(`patient is ${res.locals.cdsData[patientId]}`);
  } else {
    res.locals.cdsData[patientId] = "dummyPatient";
  }

  //cig identifier and status of creating CIG remotely
  let cig_to, statusCreatedCig;

  //main function to add Recommendations from Subguidelines into a temp CIG remotely
  try {
    //create a temp CIG
    const dataset = await createCigRemotely();

    //status of creating CIG
    statusCreatedCig = dataset.status;
    logger.info(JSON.stringify("statusCreatedCig " +statusCreatedCig))
    //check dataset is created otherwise fail
    if (statusCreatedCig !== 200)
      throw Error(
        "Remote TMR dataset was not successfully created. Status is " +
          statusCreatedCig
      );

    //get temp cig IDENTIFIER from result {cig_id: "id"}
    cig_to = "" + dataset.data.cig_id;

    //add cig label to response local var
    res.locals.cdsData["cigId"] = cig_to;

    //combine subguidelines from one CIG and await until they are done
    for (const cig of involvedCIGList) {
      
      logger.info(`cig is ${cig}`);

      //create list of sub-guideline identifiers from outcomes in
      let subCigStringList = new Array();

      for (let val of parametersMap.values()) {
        if (val[ciglist].includes(cig))
          subCigStringList.push(val[datalist]); //from "dataList" anf "cigList" to constants
      }

      //flatten results
      subCigStringList = subCigStringList.flat(1);
      logger.info(subCigStringList.toString());

      //add relevant recommendations to mergedCIG
      let cigsAddedResult = await addSubCigs(cig, cig_to, subCigStringList);

      //if OK, status should be 204 - no content
      if (cigsAddedResult.status > 204)
        throw Error(
          "subCIGs (" +
            JSON.stringify(subCigStringList) +
            ") were not added from " +
            cig +
            " to " +
            cig_to +
            ". Status is " +
            stat
        );
    }

    //fetch interactions
    let interactionsPromise = getInteractions(cig_to);
    //logger.info(interactionsPromise.data);

    //fetch recommendations
    let cigPromise = getTempCig(cig_to);

    //resolve promises
    let [interObj, recObj] = await Promise.all([
      interactionsPromise,
      cigPromise,
    ]);
    //get their data
    let interObjData = interObj.data ? interObj.data : [];
    let recObjData = recObj.data ? recObj.data : [];

    //////////////////

    ///create argumentation request
    let reqBodyTemplateMap = new Map();
    let templateActionsMap = new Map();

    //retrieve TEMPLATES_COPD
    for await (const doc of Model.find().lean()) {
      //name of template
      let label = doc[labelTemplate];

      //add body template of label
      reqBodyTemplateMap.set(label, doc[bodyTemplate]);

      //add list of fields to be updated and corresponding paths
      templateActionsMap.set(label, doc[addTemplate]);
    }

    //Workflow for the argumentation engine//

    //label for argumentation template
    let labelArgTemplate = "argumentation-template";
    let argTemplateBody = reqBodyTemplateMap.get(labelArgTemplate);
    let argumentationFieldsArr = templateActionsMap.get(labelArgTemplate);

    //create argumentation request form
    setDataTemplateArgumentation(
      {
        cigId: cig_to,
        recommendations: recObjData,
        interactions: interObjData,
      },
      parametersMap,
      argumentationFieldsArr,
      argTemplateBody
    );

    //logger.info(`Argumentation request form is ${JSON.stringify(argTemplateBody,2)}`);
    //logger.info(`interactions is ${JSON.stringify(interObjData,2)}`);
    
    //call argumentation machine//

    //send TEMPLATES_COPD to resolution engine.
    let argumentationResponse = await callResolutionEngine(argTemplateBody);
    let outputResolution = argumentationResponse.data;
     //logger.info(`outputResolution is ${outputResolution}`);
    //get its data
    if (
      outputResolution.hasOwnProperty("extensions")
    ) {
      //add results to response for forwarding to next middleware
      res.locals.cdsData["argumentation"] = outputResolution["extensions"];
    } else {
      logger.error(
        `argumentation engine is missing expected property 'extensions'`
      );
      throw Error(
        `argumentation engine is missing expected property  'extensions'`
      );
    }
    // ENDS ARGUMENTATION WORKFLOW

    //add results to response for forwarding to next middleware
    //if arrived here, property TMR exists already
    res.locals.cdsData["tmrObject"] = argTemplateBody['TMR'];

    //cal next middleware
    next();
  } finally {
    //if temporary dataset was created, delete it
    if (statusCreatedCig === 200) {
      try {
        deleteCigRemotely(cig_to);
      } catch (error) {
        logger.error(
          "error when attempting to delete temporary dataset: \n" + error
        );
      }
    }
  }
};
