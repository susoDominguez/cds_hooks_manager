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
  pathList,
  aDataPathLbl,
  noCIG,
  dataPathMap
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
      let mongoDbDoc_Label = aMongoDbDoc.hasOwnProperty(paramName) ? aMongoDbDoc[paramName] : undefined;
      //if label of eform missing, throw error
      if (mongoDbDoc_Label === undefined)
        throw new ErrorHandler(
          500,
          `a parameter label is missing on the mongoDB document.`
        );

        //is the list of involved CIgs empty?
        let MongoDbDoc_CigListIsEmpty = 
        aMongoDbDoc.hasOwnProperty(cigInvolved) ? 
          (Array.isArray(aMongoDbDoc[cigInvolved])? (aMongoDbDoc[cigInvolved].length===0) : false) :
           false;

        //which dataPath is first? this matters because when the value returned does not come from the outcome list
        //then it comes from the first dataPath object, which possibly may have been modified by actions on it.
        let mainDataPath_label = 
          aMongoDbDoc.hasOwnProperty(pathList) && aMongoDbDoc[pathList][0].hasOwnProperty(aDataPathLbl) ? 
          aMongoDbDoc[pathList][0][aDataPathLbl] :
          false;
      //if main datapath label is false, then an error has ocurred
      if(mainDataPath_label === false) {
        throw new ErrorHandler(
          500,
          `The first data path object is missing some properties.`
        );
      }

      //create object with arguments and their applicable actions. It also contains output as taken from eform
      let actionsObj = addFunctionsFromTemplateToArgsObject(aMongoDbDoc);

      //transform dataPaths from e-form in fetch document into a map where the key is the eform parameter label

      //fetch specific data from hook context using mongodb e-forms, then add to MAP dataPathMap in actionsObj

      getDataPointValues(body, aMongoDbDoc, actionsObj[dataPathMap]);

      //apply first: user-defined functions, then comparisons between arguments and subClassOf checks,
      // to RHS argument array in the object (no return value req as it is pass-by-ref)
      await applyActions(
        body,
        actionsObj["argsOutcomeList"],
        actionsObj["funListAction"],
        actionsObj[dataPathMap]
      );

      //produce list of results for each dataPath object:
      //if the list of involved CIGs is empty or we are using the non-cig Model,
      //return a mapping, otherwise return the selected Output
      let outcomeVal = await getOutcomeList(Model, mongoDbDoc_Label, actionsObj, MongoDbDoc_CigListIsEmpty, mainDataPath_label);

      logger.info(
        `value to be added to Map for eform ${mongoDbDoc_Label} is: ${JSON.stringify(
          outcomeVal
        )}`
      );

      //if from CIG-based router, output is an object containing values and (possibly) CIG involved
      //if not, output is just the values
      //create value object for given eform in Map
     
      let aParam = new Object({"name": undefined, "value": undefined});

      //could it be different for other models
       switch (cigModel) {
        default:
          aParam["name"] = mongoDbDoc_Label;
          aParam["value"] = outcomeVal;
          // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
          if(aMongoDbDoc.hasOwnProperty(cigInvolved) && Array.isArray(aMongoDbDoc[cigInvolved]) && aMongoDbDoc[cigInvolved].length > 0 ) aParam["cigsInvolved"] = aMongoDbDoc[cigInvolved];
          parameters.push(aParam);
          break;
          //TODO: to be discarded and added to cds services manager
          //add new CIG to the array of the collection of CIGs from all Mongodb documents, avoiding repetition
         // for (const cig of cigs) {
          //  if (!requiredCIGs.includes(cig)) requiredCIGs.push(cig);
      } 

      logger.info(
        `Parameters array has data: ${JSON.stringify(parameters)}`
      );
    }//endOf for await loop

    //Parameters to transfer to next middleware
    res.locals.hookData = { "parameters" : parameters};

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
