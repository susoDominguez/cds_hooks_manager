import {
  getDataPointValues,
  evaluateConstraints,
  applyActions,
  collectActionsFromDocument,
  callCdsServicesManager,
  getNoConstraintsResult,
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
  outputArray,
  action,
  actionList,
} from "../database/constants.js";

export default {
  /**
   * Using NoSql documents as CDS hooks query instructions:
   * find and possibly convert data from hook context into new data
   * Store (new) data into a Map construct where the key is the name of the parameter as given document,
   * and the value is an object with a pair of fields:
   * the (new) data and a reference to the CIG (if existing)
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
    let hookContext = req.body;

    //instantiate Mongoose model for a particular DB collection which it is identified via its hook id
    const Model = getModelbyCig(cigModel, hookId);

    //parameters to be added to request call to next middleware service:
    let parameters = new Array();
    //if collection is not found (but created by default by Mongoose anyway)
    //or every single parameter has no value
    //then it is not time yet to trigger the cds hook beyond this point
    let hasParamVals = false;

    //retrieve all data for querying//

    //get cursor Promise to all parameters from this request
    for await (const aMongoDbDoc of Model.find().lean()) {
      //key of Map
      let aMongoDbDocName = aMongoDbDoc.hasOwnProperty(paramName)
        ? aMongoDbDoc[paramName]
        : undefined;

      //if label of eform missing or empty, throw error
      if (typeof aMongoDbDocName === "undefined" || aMongoDbDocName === "")
        throw new ErrorHandler(
          500,
          `a parameter label is missing on one of the mongoDB document for hook ${hookId}.`
        );

      logger.info(`Processing MongoDB document with label: ${aMongoDbDocName}`);

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
          throw new ErrorHandler(
            500,
            `${keyParam} has no constraint satisfaction actions, but a non-empty constraint list. This is not allowed. The constraint list contains: ${JSON.stringify(
              actionsObj[outputArray]
            )}.`
          );
      }

      //transform dataPaths from e-form in fetch document into a map where the key is the eform parameter label
      //fetch specific data from hook context using mongodb e-forms, then add to initially empty MAP dataPathObjectMap
      getDataPointValues(hookContext, aMongoDbDoc, actionsObj[dataPathMap]);

      //there must be at least one datapath element in the array, otherwise is an error
      const ref2firstDatapath =
        aMongoDbDoc.hasOwnProperty(pathList) &&
        Array.isArray(aMongoDbDoc[pathList]) &&
        aMongoDbDoc[pathList].length > 0
          ? aMongoDbDoc[pathList][0]["label"]
          : null;
      if (typeof ref2firstDatapath === null)
        throw new ErrorHandler(
          500,
          `The dataPath Object is empty for parameter name ${aMongoDbDocName} when it should contain at least one element.`
        );

      //apply first: user-defined functions, then SNOMED CT queries, next comparisons between arguments
      //no return value req as it is pass-by-ref
      await applyActions(
        hookContext,
        actionsObj["processingActions"],
        actionsObj[dataPathMap]
      );

      //variable to hold result for this iteration of the loop
      let outcomeVal;

      // If there are no constraint actions to be applied
      //return, from last action, the value from the referenced dataPath object where
      //arg1 has priority over arg2 when both are references
      if (actionsObj["constraintActions"].length > 0) {
        //produce list of results for each dataPath object:
        //if the list of involved CIGs is empty or we are using the non-cig Model,
        //return a mapping, otherwise return the selected Output
        outcomeVal = await evaluateConstraints(
          Model,
          aMongoDbDocName,
          actionsObj[dataPathMap],
          actionsObj["constraintActions"],
          actionsObj[outputArray]
        );

        /* logger.info(
        `value to be added to Map for eform ${aMongoDbDocName} is: ${JSON.stringify(
          outcomeVal
        )}`
          );*/
      } else {
        //empty constraint list
        //add result from the last 'processingAction' action
        //where the value in arg1 has priority over the value in arg2 when both are references (keys)
        //otherwise return value from parsing hook context
        outcomeVal = getNoConstraintsResult(
          aMongoDbDoc,
          actionsObj[dataPathMap],
          ref2firstDatapath
        );
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
        //there is some data to be submitted to next middleware
        hasParamVals = true;
        let aParam = new Array(aMongoDbDocName);
        //add value
        let valObj = { value: outcomeVal };
        // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
        if (
          aMongoDbDoc.hasOwnProperty(cigInvolved) &&
          Array.isArray(aMongoDbDoc[cigInvolved]) &&
          aMongoDbDoc[cigInvolved].length > 0
        )
          valObj["activeCIG"] = aMongoDbDoc[cigInvolved];

        //add value object to parameter array
        aParam.push(valObj);
        //add parameter array to final array
        parameters.push(aParam);

        logger.info(
          `Request body to be forwarded to next microservice is: ${JSON.stringify(
            parameters
          )}`
        );
      }
    } //endOf for await loop

    //Parameters to transfer to next middleware, unless is empty array
    res.locals.hookData = hasParamVals ? parameters : new Array();

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
    logger.info(
      `"body of request call to cds services manager is ${JSON.stringify(
        cdsData
      )}`
    );
    //send request
    const data = await callCdsServicesManager(
      req.params.hook,
      req.params.cigId,
      cdsData
    );
    //return response
    res.status(200).json(data);
  },
};
