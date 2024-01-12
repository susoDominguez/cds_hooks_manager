import {
  getDataPointValues,
  evaluateConstraints,
  applyActions,
  collectActionsFromDocument,
  callCdsServicesManager,
  getNoConstraintsResult,
} from "./data-processing-module.js";
//import redisClient from "../database/ct_server_manager/memCachedServer/redisServer.js";
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
   * Using NoSql documents as CDS hooks query instructions:
   * find and possibly convert response from hook body into new response
   * Store (new) response into a Map construct where the key is the name of the parameter as given document,
   * and the value is an object with a pair of fields:
   * the (new) response and a reference to the CIG (if existing)
   * @param {json} req request
   * @param {json} res serviceResponse
  
   * @param {function} next callback
   */
  fetchParams: async function (req, res, next) {

    //GET CDS SERVICE ID//
    //service id extracted from route
    const {service_id} = req.params;

    if (!service_id)
      return next(
        new ErrorHandler(500, "Error: CDS service ID missing in call.")
      );

    logger.info("service_id is " + service_id);

    //GET guideline management system (GMS) ID
    //If non-existent, use general DB for non-CIG-related hooks
    const gms_id = req.params.gms_id || noCIG;
   
    logger.info("Guideline management system is " + gms_id);


    //GET CDS SERVICE HOOK body response
    const {body} = req;
  //  logger.debug(`CDS service hook body response is ${JSON.stringify(body)}`)
    if (!body)
      return next(
        new ErrorHandler(
          500,
          `CDS service ${service_id} is missing hook body values in its message.`
        )
      );

    //instantiate Mongoose model for a particular DB collection which it is identified via its hook id
    const Model = getModelbyCig(gms_id , service_id);
    if (!Model)
      return next(
        new ErrorHandler(
          500,
          `Internal error: CDS service ${service_id} has not been able to create a model to fetch body Processing Documents.`
        )
      );

    ///////////////////////
    ///FETCH body processing documents for CDS service id///

    //parameters to be added to request call to next middleware service:
    let parameters = new Array();
    //if collection is not found (but created by default by Mongoose anyway)
    //or every single parameter has no value
    //then it is not time yet to trigger the cds hook beyond this point
    let hasParamVals = false;

    //retrieve all response for querying//

    //get cursor Promise to all parameters from this request
    for await (const aMongoDbDoc of Model.find().lean()) {
      //key of Map
      const aMongoDbDocName = aMongoDbDoc.hasOwnProperty(paramName)
        ? aMongoDbDoc[paramName]
        : undefined;

      //if label of eform missing or empty, throw error
      if (typeof aMongoDbDocName === "undefined" || aMongoDbDocName === "")
        return next(
          new ErrorHandler(
            500,
            `a parameter label is missing on one of the mongoDB document for cds service ${service_id}.`
          )
        );

      logger.info(`Processing parameter: ${aMongoDbDocName}`);

      //create object with arguments and their applicable actions.
      //It also contains output as taken from eform
      let actionsObj = collectActionsFromDocument(aMongoDbDoc);

      //if no constraint satisfaction actions but output array has elements, the structure is incorrect. Throw error
      if (
        Array.isArray(actionsObj["constraintActions"]) &&
        actionsObj["constraintActions"].length === 0
      ) {
        //if there are values in output, this is an error
        if (
          Array.isArray(actionsObj[outputArray]) &&
          actionsObj[outputArray].length > 0
        )
          return next(
            new ErrorHandler(
              500,
              `${aMongoDbDocName} has no constraint satisfaction actions, but a non-empty constraint list. This is not allowed. The constraint list contains: ${JSON.stringify(
                actionsObj[outputArray]
              )}.`
            )
          );
      }

      //transform dataPaths from e-form in fetch document into a map where the key is the eform parameter label
      //fetch specific response from hook body using mongodb e-forms, then add to initially empty MAP dataPathObjectMap
      getDataPointValues(body, aMongoDbDoc, actionsObj[dataPathMap]);

      //there must be at least one datapath element in the array, otherwise is an error
      const ref2firstDatapath =
        aMongoDbDoc.hasOwnProperty(pathList) &&
        Array.isArray(aMongoDbDoc[pathList]) &&
        aMongoDbDoc[pathList].length > 0
          ? aMongoDbDoc[pathList][0]["label"]
          : null;
      if (typeof ref2firstDatapath === null)
        return next(
          new ErrorHandler(
            500,
            `The dataPath Object is empty for parameter name ${aMongoDbDocName} when it should contain at least one element.`
          )
        );

      try {
        //apply first: user-defined functions, then SNOMED CT queries, next comparisons between arguments
        //no return value req as it is pass-by-ref
        await applyActions(
          body,
          actionsObj["processingActions"],
          actionsObj[dataPathMap]
        );
      } catch (error) {
        logger.error(
          `Error in function applyActions: ${JSON.stringify(
            error
          )} with hookcontextDatahookcontextData ${JSON.stringify(
            body
          )} and processingActions ${JSON.stringify(
            actionsObj["processingActions"]
          )} and dataPathMap ${JSON.stringify(actionsObj[dataPathMap])}.`
        );
        return next(
          new ErrorHandler(
            500,
            `Internal error when processing CDS service ${service_id}.`
          )
        );
      }

      //variable to hold result for this iteration of the loop
      let outcomeVal;

      // If there are no constraint actions to be applied
      //return, from last action, the value from the referenced dataPath object where
      //arg1 has priority over arg2 when both are references
      if (actionsObj["constraintActions"].length > 0) {
        //produce list of results for each dataPath object:
        //if the list of involved CIGs is empty or we are using the non-cig Model,
        //return a mapping, otherwise return the selected Output
        try {
          outcomeVal = await evaluateConstraints(
            Model,
            aMongoDbDocName,
            actionsObj[dataPathMap],
            actionsObj["constraintActions"],
            actionsObj[outputArray]
          );
        } catch (error) {
          logger.error(
            `Error function evaluateConstraints. With aMongoDbDocName ${JSON.stringify(
              aMongoDbDocName
            )}, dataPathMap ${JSON.stringify(
              actionsObj[dataPathMap]
            )}, constraintsActions ${JSON.stringify(
              actionsObj["constraintActions"]
            )}, outputArray ${JSON.stringify(actionsObj[outputArray])} , and error:  ${error}.`
          );
          return next(
            ErrorHandler(
              500,
              `Internal error when processing CDS service ${service_id}.`
            )
          );
        }
      } else {
        //empty constraint list
        //add result from the last 'processingAction' action
        //where the value in arg1 has priority over the value in arg2 when both are references (keys)
        //otherwise return value from parsing hook body
        try { 
          outcomeVal = getNoConstraintsResult(
            aMongoDbDoc,
            actionsObj[dataPathMap],
            ref2firstDatapath
          );
        } catch(error){ 
          logger.error(
            `Error function getNoConstraintsResult. With aMongoDbDoc ${JSON.stringify(
              aMongoDbDoc
            )}, dataPathMap ${JSON.stringify(
              actionsObj[dataPathMap]
            )}, ref2firstDatapath ${JSON.stringify(
              ref2firstDatapath
            )}, error ${error}}.`
          );
          return next(
            ErrorHandler(
              500,
              `Internal error when processing CDS service ${service_id}.`
            )
          );
        }
      
      }
      //if from CIG-based router, output is an object containing values and (possibly) CIG involved
      //if not, output is just the values
      //create value object for given eform in Map
      if (
        (Array.isArray(outcomeVal) && outcomeVal.length > 0) ||
        (!Array.isArray(outcomeVal) &&
          typeof outcomeVal !== "undefined" &&
          outcomeVal !== null)
      ) {
        //create an arrat to hold the key -the given name of the param- and the value + involved CIG list (if any)
        let aParam = new Array(aMongoDbDocName);
        //add value
        const valObj = { value: outcomeVal, activeCIG: undefined };
        // to represent the CIG(s) the value response (possibly sub-CIG ids) belongs to
        if (
          aMongoDbDoc.hasOwnProperty(cigInvolved) &&
          Array.isArray(aMongoDbDoc[cigInvolved]) &&
          aMongoDbDoc[cigInvolved].length > 0
        )
          valObj["activeCIG"] = aMongoDbDoc[cigInvolved];

        //add value object to parameter array
        aParam.push(valObj);
        //add parameter array to final array that will be converted in a map
        parameters.push(aParam);

       // logger.info(
        //  `Requestbody to be forwarded to next microservice is: ${JSON.stringify(
          //  parameters
         // )}`
       // );
      }
    } //endOf for await loop

    ///////////////////////////////////////////
    ///////////////////////////////////////////
    
    //CREATE Parameters to transfer to next middleware, unless is empty array

    //argument list for active CDS services manager service
    res.locals.service_context = parameters;

    //call next middleware
    next();
  },
  /**
   *
   * @param {object} req request object
   * @param {object} res serviceResponse
   object
   * @param {object} next callback
   */
  requestCdsService: async function (req, res, next) {
    const {service_context} = res.locals ;
    const {service_id} = req.params ;
    const gms_id = req.params.gms_id || noCIG ;
    const {profile_id} = req.params ;

    logger.info(
      `body of CDS request call  ${service_id} to next microservice is ${JSON.stringify(
        service_context
      )}`
    );

    const arguments_obj = JSON.parse( JSON.stringify({ 'service_context' : service_context, 'profile_id' : profile_id }));

    //send request
    
    let statusCode, resData;

    try {

      const {status_code, response} = await callCdsServicesManager (
        service_id,
        gms_id,
        arguments_obj);

      if(status_code > 400) {
        logger.error(`Error CDS services manager response status_code is ${status_code}. Response is: ${response}`);
        throw new Error(response);
      }

      statusCode = status_code ;
      resData = response ;

    } catch (err) {
      statusCode = 500;
      resData = {};
      logger.error(`Error when applying callCdsServicesManager with parameters: service Id ${JSON.stringify(service_id)}, cig model Id ${JSON.stringify(gms_id)}, service body ${JSON.stringify(service_context)}. The error is: ${JSON.stringify(err)}`);

    } finally {
      res.status(statusCode).json(resData);
    }
    next();
  },
};
