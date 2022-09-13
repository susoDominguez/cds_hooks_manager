import {
  getDataPointValues,
  getOutcomeList,
  applyActions,
  addFunctionsFromTemplateToArgsObject,
  callCdsServicesManager
} from "./data-processing-module.js";
import { getModelbyCig } from "../database_modules/models.js";
import logger from "../config/winston.js";
import { ErrorHandler } from "../lib/errorHandler.js";
//const { MONGODB_NON_CIG_DB } = process.env;
import {
  paramName,
  cigInvolved,
  datalist,
  ciglist,
} from "../database_modules/constants.js";

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
    let cigModel = req.params.cigId || null;
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

    //Map of e-form parameters to be added to request call:
    // key => eform.param.label, value => { cigInvolved: [String], valueList: [object]}
    let paramMap = new Map();

    //triggered CIG identifiers
    let requiredCIGs = new Array();

    //retrieve all data for querying//

    //get cursor Promise to all parameters from this request
    for await (const eform of Model.find().lean()) {
      //key of Map
      let eformName = eform.hasOwnProperty(paramName) ? eform[paramName] : undefined;
      //if label of eform missing, throw error
      if (eformName === undefined)
        throw new ErrorHandler(
          500,
          `a parameter label is missing on eform`
        );

      //create object with arguments and their applicable actions. It also contains output as taken from eform
      let actionsObj = addFunctionsFromTemplateToArgsObject(eform);

      //transform dataPaths from e-form in fetch document into a map where the key is the eform parameter label

      //fetch specific data from hook context using mongodb e-forms, then add to MAP argsPathListMap in actionsObj
      const argsPathListMap = "argsPathListMap";
      getDataPointValues(body, eform, actionsObj[argsPathListMap]);

      //apply first: user-defined functions, then comparisons between arguments and subClassOf checks,
      // to RHS argument array in the object (no return value req as it is pass-by-ref)
      await applyActions(
        body,
        actionsObj["argsOutcomeList"],
        actionsObj["funListAction"],
        actionsObj["argsPathListMap"]
      );

      //produce result value
      let resultArr = await getOutcomeList(Model, eformName, actionsObj);

      logger.info(
        `value to be added to Map for eform ${eformName} is: ${JSON.stringify(
          resultArr
        )}`
      );

      //if from CIG-based router, output is an object containing values and (possibly) CIG involved
      //if not, output is just the values
      //create value object for given eform in Map
      let finalValObj = null;

       switch (cigModel) {
        case "non-cig":
          finalValObj = resultArr;
          break;
        default:
          //result is an object
          finalValObj = {};
          //add result (may be array or not) value to property
          finalValObj[datalist] = resultArr;
          //add a property in value object of MAP for parameter,
          // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
          let cigList = eform.hasOwnProperty(cigInvolved)
            ? eform[cigInvolved]
            : new Array();
          //check is array as expected
          if (!Array.isArray(cigList))
            throw new ErrorHandler(
              500,
              "parameter " + cigInvolved + " is not an Array as expected."
            );
          //add new CIG to array of CIGs avoiding repetition
          for (const cig of cigList) {
            if (!requiredCIGs.includes(cig)) requiredCIGs.push(cig);
          }
          //add list of identified CIGs to result object
          finalValObj[ciglist] = cigList;
          break;
      } 

      //add result to Map with key the eform label
      paramMap.set(eformName, finalValObj);
      logger.info(
        `eform with label ${eformName} has data: ${JSON.stringify(paramMap.get(eformName))}`
      );
    }//endOf for await loop

    //add list of CIGs to Map
    paramMap.set("cigsList", requiredCIGs);
    //Parameters to transfer to next middleware
    res.locals.hookData = paramMap;

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
      let cdsData = JSON.stringify( Object.fromEntries(res.locals.hookData) );
      logger.info(`cdsData is ${cdsData}`);
      //send request
       const data = await callCdsServicesManager(req.params.hook, req.params.cigId, cdsData);
       //return response
       res.status(200).json(data);
  }
};
