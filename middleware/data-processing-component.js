"use strict";

const {
  getDataPointValues,
  getOutcomeList, applyActions, addFunctionsFromTemplateToArgsObject
} = require("./data-processing-module");
const {getModelbyCig} = require("../database_modules/models")
const logger = require("../config/winston");
const { ErrorHandler } = require("../lib/errorHandler");
const {
  MONGODB_NON_CIG_DB
} = process.env;
const {
  paramName,
  cigInvolved,
  datalist,
  ciglist,
} = require("../database_modules/constants.js");


module.exports = {
  /**
   * Using DB forms as guidance:
   * find and possibly convert data from hook context into new data 
   * Store  (new) data into a Map where the key is the name of the parameter as given on the DB form,
   * and the value is an object with a pair of fields:
   * the (new) data and a reference to the CIG (TODO:)
   * @param {json} req request
   * @param {json} res response
   * @param {function} next callback
   */
  fetchParams: async function (req, res, next) {

    //GT SPECIFIC HOOK CONTEXT//
  //hook id extracted from route
  let hookId = req.params.hook ;
  logger.info("hookId is " + hookId);

  //CIG Model id extracted from route. If non-existent, use general DB for non-CIG-related hooks
  let cigId = req.params.cigId || "non-cig" ;
  logger.info("cigId is " + cigId);

   //hook context
   let body = req.body;

  //instantiate Mongoose model for a particular DB document which it is identified via its hook id
  const Model = getModelbyCig(cigId,hookId);

  //if collection name is not found, throw error//TODO: error is already sent within getModelByCig
  if (!Model)
    throw new ErrorHandler(500,
     Model + "Mongoose model not instantiated. Hook Id " + hookId + " did not lead to data document of same name at database."
    );

  //Map of parameters to be added to request call:
  // key => param.label, value => { cigInvolved: [String], valueList: []}
  let paramMap = new Map();

  //TODO: transfer to CDS services
  //triggered CIG identifiers
  //let requiredCIGs = new Array();

  //retrieve all data for querying//

  //get cursor Promise to all parameters from this request
  for await (const doc of Model.find().lean()) {
        //key of Map
        let paramKey = doc.hasOwnProperty(paramName) ? doc[paramName] : undefined;
        //if label of param missing, throw error
        if (paramKey === undefined)
          throw new ErrorHandler(500,`a parameter label is missing from template`);

    //create object with arguments and their applicable actions
    let actionsObj = addFunctionsFromTemplateToArgsObject(doc);

    //transform PathList from e-form in fetch document into a map where the key is the parameter label


    //fetch specific data from hook context using e-forms, then add to MAP argsPathListMap
    getDataPointValues(body, doc, actionsObj['argsPathListMap']);

    //apply first user-defined functions, comparisons between arguments and ancestors check,
    // to RHS argument array in the object (no return value req as it is pass-by-ref)
    await applyActions(
      body,
      actionsObj["argsOutcomeList"],
      actionsObj["funListAction"],
      actionsObj["argsPathListMap"]
    );

    //create value object for given parameter in Map
    let result = null;

    //add result value
    let resultArr = await getOutcomeList(Model, paramKey, actionsObj);

    logger.info(`value to be added to Map for parameter: ${paramKey} is: ${JSON.stringify(resultArr)}`);

    //specific actions for given routers
    switch (req.path.trim()) { 

      case "/copd-assess":
        result = resultArr;
        break;

      default:
        //result is an object
        result = {};
        //add result value to property
        result[datalist] = resultArr;//flat(resultArr,1);
        logger.info(`value to be added to Map for parameter: ${paramKey} after flattening is: ${JSON.stringify(result[datalist])}`);
        //add a property in value object of MAP for parameter,
        // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
        let cigList = doc.hasOwnProperty(cigInvolved)
          ? doc[cigInvolved]
          : undefined;
        //check is array as expected
        if (!Array.isArray(cigList))
          throw new ErrorHandler(500,
            "parameter " + cigInvolved + " is not an Array as expected."
          );

          //TODO: move this to CDS Services manager
        //add new CIG to array of CIGs avoiding repetition
        for (const cig of cigList) {
          if (!requiredCIGs.includes(cig)) requiredCIGs.push(cig);
        }
        //add property and corresponding value to the result object before inserting into MAP
        result[ciglist] = cigList;
        break;
    }

    //add to Map
    paramMap.set(paramKey, result);
    logger.info(`param ${paramKey} has value ${JSON.stringify(paramMap.get(paramKey))}`);
  }
  
  //Parameters to transfer to next middleware
  res.locals.requiredCIGs = requiredCIGs; //possibly empty if not part of router to extract CIG data
  res.locals.cdsParams = paramMap;

  //call next middleware
  next();
  }
 
};
