"use strict";

const {
  getPathValueAndActions,
  getOutcomeList,
  applyActions,
} = require("./data-processing-module");
const {
  getModel,
  HookSchema,
} = require("../database_modules/dbConnection_Mongoose");
const logger = require("../config/winston");
const { ErrorHandler } = require("../lib/errorHandler");
const {
  paramName,
  cigInvolved,
  datalist,
  ciglist,
} = require("../database_modules/constants.js");

module.exports = {
  /**
   * Using DB forms as guidance:
   * find, extract and modified data from contexts as part of the request call, as specified in CDS Hooks
   * Store modified data into a Map where the key is the name of the parameter as given on the DB form
   * and the value is an object with a pair of properties:
   * the data itself and a list of CIG ids for which the data is applicable (possibly as an identifier of parts of the CIG content).
   * @param {json} req request
   * @param {json} res response
   * @param {function} next callback
   */
  fetchParams: async function (req, res, next) {
    //GET SPECIFIC CONTEXT data//
    //hook route//

    //get CIG engine and path
    //substring without initial '/'
    let subPath = req.path.substring(1);
    //separate CIG engine path -possibly none- from cds service path
    let pathList = subPath.split("/");
    //check whether it is a CIG interaction request
    let hasCigEngine = pathList.length > 1;
    //name of CIG engine
    let cigEngine = hasCigEngine ? pathList[0] : null;
    //get cds service
    //let path = (req.params["0"]) ? (req.params["0"] + "-careplan-select") : cigEngine ? pathList[1] : subPath ;
    let path = hasCigEngine ? pathList[1] : pathList[0];

    //add to response
    res.locals.cigEngine = cigEngine;
    res.locals.path = path;
    return next();
    //hook context
    let body = req.body;

    //DB collection name for a hook context is the hook route label with '-params' appended to it
    const db_collection = path.trim() + "-params";

    //instantiate Mongoose model for existing DB collections
    const Model = getModel(db_collection);

    //if collection name is not found, throw error
    if (!Model)
      throw new ErrorHandler(
        500,
        "FetchParams function: Model collection name is undefined or there is a typo as it could not be found"
      );

    //Map of params. to be forwarded to the next middleware
    let paramMap = new Map();

    //set as array for CIGs involved in this operation. To be shared with the TMR functionality module
    let cigInvolvedList = new Array();

    //retrieve all data for querying//

    //get cursor Promise to all parameters from this request
    for await (const doc of Model.find().lean()) {
      //key of Map
      let paramKey = doc.hasOwnProperty(paramName) ? doc[paramName] : undefined;

      if (paramKey === undefined)
        throw new ErrorHandler(
          500,
          `Funct FetchParams: Parameter ${paramName} may be missing from template in MongoDB`
        );

      //create object with arguments and actions to be applied
      const actionsObj = getPathValueAndActions(body, doc);

      //apply functions first to RHS argument array in the object (no return value as it is pass-by-ref)
      applyActions(
        body,
        actionsObj["funListAction"],
        actionsObj["argsPathList"]
      );

      //create value object for given parameter in Map
      let result = null;

      //add result value
      let resultArr = await getOutcomeList(Model, paramKey, actionsObj);

      logger.info(
        `value to be added to Map for parameter: ${paramKey} is: ${JSON.stringify(
          resultArr
        )}`
      );

      //specific actions for given routers
      switch (req.path.trim()) {
        case "/copd-assess":
          result = resultArr;
          break;
        default:
          //result is an object
          result = {};
          //add result value to property
          result[datalist] = resultArr; //flat(resultArr,1);
          logger.info(
            `value to be added to Map for parameter: ${paramKey} after flattening is: ${JSON.stringify(
              result[datalist]
            )}`
          );
          //add a property in value object of MAP for parameter,
          // to represent the CIG(s) the value data (possibly sub-CIG ids) belongs to
          let cigList = doc.hasOwnProperty(cigInvolved)
            ? doc[cigInvolved]
            : undefined;
          //check is array as expected
          if (!Array.isArray(cigList))
            throw ErrorHandler(
              500,
              "Funct fetchParams: parameter " +
                cigInvolved +
                " is not an Array as expected."
            );
          //add new CIG to array of CIGs avoiding repetition
          for (const cig of cigList) {
            if (!cigInvolvedList.includes(cig)) cigInvolvedList.push(cig);
          }
          //add property and corresponding value to the result object before inserting into MAP
          result[ciglist] = cigList;
          break;
      }

      //add to Map
      paramMap.set(paramKey, result);
      logger.info(
        `param result is: ${paramKey} => ${JSON.stringify(
          paramMap.get(paramKey)
        )}`
      );
    }

    //pass data to next middleware into the requirement obj
    res.locals.cigInvolvedList = cigInvolvedList; //possibly empty if not part of router to extract CIG data
    //convert Map into JSON object, for transfer
    res.locals.parametersMap = paramMap;

    //call next middleware
    next();
  },

  /**
   *
   * @param {req} req
   * @param {res} res
   * @param {next} next
   */
  getCdsServices: async function (req, res, next) {
    //params holds the captured values in the route path
    //find document by its cigId as stated in req.params
    HookSchema.findOne({ cigId: "pp" })
      .select({ services: true, _id: false })
      .exec()
      .then((services) => {
        res.status(200).json(services["services"]);
      })
      .catch((err) => {
        next(
          new ErrorHandler(
            err.status || 500,
            ("error when attempting to retrieve cds-services for cigId: " +
              ((req.param.cigId) ? req.param.cigId : "-null or non-existent cigId-") + ". " + err.stack)
          )
        );
      });
  },
};
