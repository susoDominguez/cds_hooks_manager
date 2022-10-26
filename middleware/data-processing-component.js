import {
  getDataPointValues,
  getOutcome,
  applyActions,
  addFunctionsFromTemplateToArgsObject,
  callCdsServicesManager
} from "./data-processing-module.js";
import { getModelbyCig } from "../database/models.js";
import logger from "../config/winston.js";
import { ErrorHandler } from "../lib/errorHandler.js";
import {
  paramName,
  cigInvolved,
  noCIG,
  dataPathMap,
  pathList,
  outputArray
} from "../database/constants.js";

export default {
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
    let hookId = req.params.hook;
    logger.info("hookId is " + hookId);

    //CIG Model id extracted from route. 
    //If non-existent, use general DB for non-CIG-related hooks
    let cigModel = req.params.cigId ?? noCIG;
    logger.info("CIG Model is " + cigModel);

    //hook context
    let body = req.body;

    //instantiate Mongoose model for a particular DB document which it is identified via its hook id
    const Model = getModelbyCig(cigModel, hookId);

    //if collection name is not found, throw error//TODO: error is already sent within getModelByCig
    if (!Model)
      throw new ErrorHandler(
        500,
        Model +
          "Mongoose model not instantiated. Hook Id " +
          hookId +
          " did not lead to data document of same name at database."
      );

    //e-form parameters to be added to request call:
    let parameters = new Array() ;

    //retrieve all data for querying//

    //get cursor Promise to all parameters from this request
    for await (const aMongoDbDoc of Model.find().lean()) {
      //key of Map
      let aMongoDbDocName = aMongoDbDoc.hasOwnProperty(paramName) ? aMongoDbDoc[paramName] : undefined;

      //if label of eform missing, throw error
      if (typeof aMongoDbDocName === 'undefined')
        throw new ErrorHandler(
          500,
          `a parameter label is missing on the mongoDB document.`
        );

      logger.info(`Processing MongoDB document with parameter = ${aMongoDbDocName}`)

      //create object with arguments and their applicable actions. It also contains output as taken from eform
      let actionsObj = addFunctionsFromTemplateToArgsObject(aMongoDbDoc);

      //keep track of the first datapath object to return its values if no constraint satisfaction actions are required
      const datapathArg1 = aMongoDbDoc.hasOwnProperty(pathList) ? aMongoDbDoc[pathList][0]['label'] : undefined;
      if(typeof datapathArg1 === 'undefined') throw new ErrorHandler(
        500,
        `Missing dataPath object from MongoDB document with parameter name ${aMongoDbDocName}.`
      );
      //transform dataPaths from e-form in fetch document into a map where the key is the eform parameter label
      //fetch specific data from hook context using mongodb e-forms, then add to MAP dataPathMap
      getDataPointValues(body, aMongoDbDoc, actionsObj[dataPathMap]);

      //apply first: user-defined functions, then comparisons between arguments and subClassOf checks,
      // to RHS argument array in the object (no return value req as it is pass-by-ref)
      await  applyActions(
        body,
        actionsObj["processingActions"],
        actionsObj[dataPathMap]
      );

      //produce list of results for each dataPath object:
      //if the list of involved CIGs is empty or we are using the non-cig Model,
      //return a mapping, otherwise return the selected Output
      let outcomeVal = await getOutcome(
        Model,
        aMongoDbDocName,
        actionsObj[dataPathMap],
        actionsObj['constraintActions'],
        actionsObj[outputArray],
        datapathArg1
        );

      logger.info(
        `value to be added to Map for eform ${aMongoDbDocName} is: ${JSON.stringify(
          outcomeVal
        )}`
      );

      //if from CIG-based router, output is an object containing values and (possibly) CIG involved
      //if not, output is just the values
      //create value object for given eform in Map
     if((Array.isArray(outcomeVal) && outcomeVal.length > 0) || (!Array.isArray(outcomeVal) && typeof outcomeVal !== 'undefined') ) {
      let aParam = new Array(aMongoDbDocName);

      //could it be different for other models
       switch (cigModel) {
        case 'tmr':
          //add value
          let valObj = { "value": outcomeVal };
          // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
          if(aMongoDbDoc.hasOwnProperty(cigInvolved) 
          && Array.isArray(aMongoDbDoc[cigInvolved]) 
          && aMongoDbDoc[cigInvolved].length > 0 ) valObj["activeCIG"] = aMongoDbDoc[cigInvolved];
          //add value object to parameter array
          aParam.push(valObj)
          //add parameter array to final array
          parameters.push(aParam);
          break;
        default:
          //add value object to parameter array
          aParam.push(outcomeVal)
          //add parameter array to final array
          parameters.push(aParam);
          break;
      } 

      logger.info(
        `Parameters array has data: ${JSON.stringify(parameters)}`
      );
     }

    }//endOf for await loop

    //Parameters to transfer to next middleware
    res.locals.hookData =  parameters;

    //call next middleware
    next();
  },
  /**
   * 
   * @param {object} req request object
   * @param {object} res response object
   * @param {object} next callback
   */
  requestCdsServices: async function (req, res, next) {
      //convert Map to object
      let cdsData = JSON.parse(JSON.stringify(res.locals.hookData));
      logger.info(`"body of request call to cds services manager is ${JSON.stringify(cdsData)}`);
      //send request
      const data = await callCdsServicesManager(req.params.hook, req.params.cigId, cdsData);
       //return response
       res.status(200).json(data);
  }
};
