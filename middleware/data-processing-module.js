import {} from "dotenv/config";
import jsonata from "jsonata";
import {
  paramName,
  functLabel,
  queryArgs,
  outcome,
  details,
  Qomparison,
  outputArray,
  typePath,
  action,
  pathList,
  isMandatory,
  xpath,
  comparison,
  defaultVal,
  findRef,
  labelTemplate,
  actionList,
  symbol,
  arg1,
  arg2,
  isA,
  hasA,
  In,
  contains,
  isAOrEq,
  hasAOrEq,
  parentOf,
  parentOrSelfOf,
  childOf,
  subsumes,
  childOrSelfOf,
  descendantOrSelfOf,
  descendantOf,
  ancestorOrSelfOf,
  ancestorOf,
  subsumesOrEq,
  anyElemIn,
  filterByClass,
  includes,
  isIncluded,
  isSubsetOf,
  isSupersetOf,
  codeSys,
  termSys,
  count,
  filterTerm,
  noCIG,
} from "../database/constants.js";
import flat from "array.prototype.flat";
import { applyUserDefinedFunct } from "../lib/user-defined-functions.js";
import { ErrorHandler } from "../lib/errorHandler.js";
import logger from "../config/winston.js";
import mongoosePackg from "mongoose";
const { Model } = mongoosePackg;
import axios from "axios";
import {
  default as getSnomedQueryResult,
  jsonEclQueryExpr,
  jsonIsaExpr,
} from "../database/ct_server_manager/snomedct/ecl.js";
//const qs from "querystring";
const { CDS_SERVICES_MS_HOST_1, CDS_SERVICES_MS_PORT_1, CDS_SERVICES_MS_ID_1,  
        CDS_SERVICES_MS_HOST_2, CDS_SERVICES_MS_PORT_2, CDS_SERVICES_MS_ID_2,
        CDS_SERVICES_MS_HOST_3, CDS_SERVICES_MS_PORT_3, CDS_SERVICES_MS_ID_3 } = process.env;
const services_url_map = new Map([ 
    [CDS_SERVICES_MS_ID_1,{"host":CDS_SERVICES_MS_HOST_1, "port":CDS_SERVICES_MS_PORT_1}],
    [CDS_SERVICES_MS_ID_2,{"host":CDS_SERVICES_MS_HOST_2, "port":CDS_SERVICES_MS_PORT_2}],
    [CDS_SERVICES_MS_ID_3,{"host":CDS_SERVICES_MS_HOST_3, "port":CDS_SERVICES_MS_PORT_3}]
  ]);
///////////////////////////////////////////////////////
/**
 *
 * @param {string} service_id
 * @param {string} gms_id
 * @param {Map} data
 * @returns response from cds services manager microservice
 */
async function callCdsServicesManager(service_id, gms_id, reqData) {
  //build specific services manager request call//
  //if cig model id undefined, then add non-cig constant
  gms_id = gms_id ?? noCIG;
  //process.env
  let base_URL;
  if(services_url_map.has(gms_id)){
    let {host, port} = services_url_map.get(gms_id);
    //TODO: https calls
    base_URL = `http://${host}:${port}/cds-services`;
  } else throw new ErrorHandler(500, `environment variables missing to call CDS services manager for CDS service Id ${service_id} and CIG framework ${gms_id}`);
  
  //build endpoint
  let service_endpoint = service_id ;
      service_endpoint += (gms_id !== noCIG) ? `/cigModel/${gms_id}` : '';
  //construct final URL
  const SERVICE_ID_URL = `${base_URL}/${service_endpoint}`;

  logger.debug(`The CDS services manager microservice being call has URL ${SERVICE_ID_URL}`);

  //create config
  let config = {
    method: "post",
    url: SERVICE_ID_URL,
    headers: {
      "Content-Type": "application/json",
    },
    data: reqData,
  };

  let data, status ;

  try {
    const response = await axios(config);
    status = response.status;
    data = response.data;
  } catch (err) {
    logger.error(`Error when applying callCDSServicesManager function with config; ${JSON.stringify(config)}`);
    status = 500;
    data = `Error at callCDSServicesManager: config: ${JSON.stringify(config)} and error: ${JSON.stringify(err)}.`
  } finally {
    return {"status_code":status, "response":data};
  }
}
/**
 * returns the type of the value.
 * It mimics behaviiour of typeOf but for non-primitives it returns a more granular typename where possible
 * @param {*} value the value to be type-checked
 * @returns
 */
function _typeOf(value) {
  if (value === null) {
    return "null";
  }
  const baseType = typeof value;
  // Primitive types
  if (!["object", "function"].includes(baseType)) {
    return baseType;
  }

  // Symbol.toStringTag often specifies the "display name" of the
  // object's class. It's used in Object.prototype.toString().
  const tag = value[Symbol.toStringTag];
  if (typeof tag === "string") {
    return tag;
  }

  // If it's a function whose source code starts with the "class" keyword
  if (
    baseType === "function" &&
    Function.prototype.toString.call(value).startsWith("class")
  ) {
    return "class";
  }

  // The name of the constructor; for example `Array`, `GeneratorFunction`,
  // `Number`, `String`, `Boolean` or `MyCustomClass`
  const className = value.constructor.name;
  if (typeof className === "string" && className !== "") {
    return className;
  }

  // At this point there's no robust way to get the type of value,
  // so we use the base implementation.
  return baseType;
}

/**
 * Given a document from the database, it returns the result of parsing the hook context and applying zero or more actions to the parsed context.
 * This function should only be applied when no constraint satisfaction actions are part of the database document.
 * @param {Object} aMongoDbDoc the Document fetched from the database containing the instructions to be applied to the hook context
 * @param {Map<string, any>} dataPathValMap a map from dataPath elements to their values. The default value is the parsed value from the hook context.
 * @param {string} ref2firstDatapath a reference to the first element in the dataPath array.
 * @returns value fetched from hook context where zero or more actions have been applied
 */
function getNoConstraintsResult(
  aMongoDbDoc,
  dataPathValMap,
  ref2firstDatapath
) {
  if (!(dataPathValMap instanceof Map))
    throw new ErrorHandler(
      500,
      `Function getNoConstraintsResult: argument with label ${dataPathValMap} was expected to be of type Map.`
    );

  //default val is the one refereced by the first dataPath element
  let outcomeVal = fetchArgumentVal(dataPathValMap, ref2firstDatapath);

  //last action element. This action must never be a constraint satisfaction action. Such check must be done before calling this function.
  let lastActionObj =
    aMongoDbDoc.hasOwnProperty(actionList) &&
    Array.isArray(aMongoDbDoc[actionList]) &&
    aMongoDbDoc[actionList].length > 0
      ? aMongoDbDoc[actionList][aMongoDbDoc[actionList].length - 1]
      : null;

  //if there is an action, extract its result. Otherwise return default value
  if (lastActionObj) {
    //get arg1 value which should be a reference
    //if not, try with arg2
    //if not, return the default outcome

    let arg1Ref, arg2Ref;
    //get value of arg1 reference
    if (
      lastActionObj.hasOwnProperty(details) &&
      lastActionObj[details].hasOwnProperty(arg1)
    ) {
      //ref name of first argument
      arg1Ref = lastActionObj[details][arg1];
    } else {
      //something is wrong then as there is no arguments for this action
      throw new ErrorHandler(
        500,
        `Function getNoConstraintsResult: There is no value for arg1 field in last action object with the following structure: ${JSON.stringify(
          lastActionObj
        )}. Check Document in Database.`
      );
    }

    //if arg1 val is not a reference to a val in the Map, try with arg2 in the action
    if (dataPathValMap.has(arg1Ref)) {
      //value of first arg
      outcomeVal = fetchArgumentVal(dataPathValMap, arg1Ref);
    } else {
      //arg1 referencing didnt work, try with arg2

      //get value of arg2, if existing, otherwise default value must be returned
      if (lastActionObj[details].hasOwnProperty(arg2)) {
        //ref name of second argument
        arg2Ref = lastActionObj[details][arg2];
        //fetch value if linked to a reference, otherwise default value must be returned
        if (dataPathValMap.has(arg2Ref)) {
          //value of second arg
          outcomeVal = fetchArgumentVal(dataPathValMap, arg2Ref);
        }
      }
    }
  }

  return outcomeVal;
}

/**
 * creates an object containing values and actions to be applied to values
 * @param {json} mongoDbDoc NoSql document containing queries and processing instructions
 * @returns {object} object containing the functions to be applied to the hook context data
 */
function collectActionsFromDocument(mongoDbDoc) {
  //logger.info(`actions: ${JSON.stringify(mongoDbDoc['actions'])}`);

  //get actions from MongoDb doc. If actions are undefined then return an empty array (no action requires application)
  let actionArray = mongoDbDoc.hasOwnProperty(actionList)
    ? mongoDbDoc[actionList]
    : new Array();

  //check we are working w/array
  if (!Array.isArray(actionArray))
    throw new ErrorHandler(
      500,
      JSON.stringify(actionArray) +
        " object from MongonDB is not an array as expected"
    );

  /// HANDLE ACTIONS ///

  //filter actions: function (goes first), comparison(second) and arra_eq (goes last)
  //object to be returned as output of this function

  let actionsObject = {
    processingActions: actionArray.filter(
      (obj) =>
        obj[action] === functLabel ||
        obj[action] === findRef ||
        obj[action] === parentOf ||
        obj[action] === parentOrSelfOf ||
        obj[action] === childOf ||
        obj[action] === childOrSelfOf ||
        obj[action] === descendantOrSelfOf ||
        obj[action] === descendantOf ||
        obj[action] === ancestorOrSelfOf ||
        obj[action] === ancestorOf ||
        obj[action] === comparison ||
        obj[action] === subsumes ||
        obj[action] === subsumesOrEq ||
        obj[action] === In ||
        obj[action] === filterByClass
    ),
    //filter only comparisons which are constraint-based; they have at most one argument from the pathList
    constraintActions: actionArray.filter(
      (obj) =>
        //not equal to any of the above elements
        obj[action] === Qomparison ||
        obj[action] === includes ||
        obj[action] === isIncluded ||
        obj[action] === isSubsetOf ||
        obj[action] === isSupersetOf ||
        obj[action] === isA ||
        obj[action] === hasA ||
        obj[action] === isAOrEq ||
        obj[action] === hasAOrEq ||
        obj[action] === anyElemIn
    ),
    //Map of arguments where the key is the parameter label and the value is the object in the pathList.
    //To be extracted from clinical context as part of request
    dataPathObjectMap: new Map(),
    //Output list, potentially a list of constraint actions to be compared with arguments for selecting zero or more outcomes if triggered.
    constraints: mongoDbDoc.hasOwnProperty(outputArray)
      ? mongoDbDoc[outputArray]
      : new Array(),
  };

  //check they are arrays
  if (
    !Array.isArray(actionsObject["processingActions"]) ||
    !Array.isArray(actionsObject["constraintActions"])
  )
    throw new ErrorHandler(
      500,
      "actionLists have not been created dynamically as expected"
    );
  //logger.info(`actionsObject processingActions: ${JSON.stringify(actionsObject['processingActions'])}`);
  //logger.info(`actionsObject constraintActions: ${JSON.stringify(actionsObject['constraintActions'])}`);
  //logger.info(`actionsObject constraints: ${JSON.stringify(actionsObject['constraints'])}`);
  return actionsObject;
}

/**
 * Fetches parameter value from hook context using information on MongoDB doc. Then, adds parameter and associated value to an instance of Map
 * @param {object} hookContext context as taken from request
 * @param {object} mongodbDoc e-form object
 * @param {Map} dataPathMap Map from eform objects to returned values
 */
async function getDataPointValues(hookContext, mongodbDoc, dataPathMap) {
  //Fetch parameters, type properly and add to MAP.
  //Then apply to already existing MAP object the actions for comparisons to find results
  //or the existing result if not comparison is needed

  //Array containing list of objects with data points to be extracted:
  const dataPathsObjectsList = mongodbDoc[pathList];

  //recognise as array
  if (!Array.isArray(dataPathsObjectsList))
    throw new ErrorHandler(
      500,
      "field dataPaths in MongoDB doc expected to be an array."
    );

  //for each path in dataPaths.
  //If path is empty list, deal with it later
  for (const aDataPathObject of dataPathsObjectsList) {
    //check it has all the expected properties
    if (
      !(
        aDataPathObject.hasOwnProperty(typePath) ||
        aDataPathObject.hasOwnProperty(isMandatory) ||
        aDataPathObject.hasOwnProperty(xpath) ||
        aDataPathObject.hasOwnProperty(labelTemplate)
      )
    )
      throw new ErrorHandler(
        500,
        `MongoDB: Parameter ${
          mongodbDoc[paramName]
        } is missing a required attribute in Property ${pathList}. ${
          aDataPathObject.hasOwnProperty(labelTemplate)
            ? " Label value is " + aDataPathObject[labelTemplate]
            : ""
        }`
      );

    //default value property on aDataPathObject is not mandatory
    //if it doesnt exists, add an undefined value
    if (!aDataPathObject.hasOwnProperty(defaultVal)) {
      aDataPathObject[defaultVal] = undefined;
    }
    //label of dataDataPathObject obj in MongoDb doc
    let aDataPathObject_label = aDataPathObject[labelTemplate];
    //type of path
    let aDataPathObject_datatype = aDataPathObject[typePath];
    //is this data optional?
    let isDataOptional = !aDataPathObject[isMandatory];

    //string with the Jpath to value and the default value
    let jpathQueryExprs = aDataPathObject[xpath];

    //obtain value from request body. If not found, JSONATA returns undefined.
    //Also could be undefined on purpose to add user-defined values in default.//TODO: does it still hold? or user-defined values in actions object?
    let valueFromContext = jpathQueryExprs
      ? getDataFromContext(jpathQueryExprs, hookContext)
      : undefined;

    //if undefined, get the default value which could also be undefined or, possibly, a JSONpath of the same type as the main one to locate an alternate value
    if (typeof valueFromContext === "undefined") {
      //get default value (possibly undefined or null)
      let defaultValue = aDataPathObject[defaultVal];
      //and check whether it is also a path to data in a resource
      //is it an array? convert into a JSON array
      if (
        typeof defaultValue === "string" &&
        defaultValue.trim().startsWith("[") &&
        defaultValue.trim().endsWith("]")
      )
        defaultValue = JSON.parse(defaultValue);

      //are we dealing with another JSONPath format?
      //TODO: Possibly add another property to confirm it is a JPath
      let isDefaultValueJpath =
        defaultValue && //defVal exists and is not undefined neither null (both falsy)
        !Array.isArray(defaultValue) && //and is not an array
        //cds Hooks informational contexts
        (("" + defaultValue).startsWith("context.") ||
          ("" + defaultValue).startsWith("prefetch.") ||
          ("" + defaultValue).startsWith("$"));

      //if default is a path, apply Jsonpath otherwise return the value
      valueFromContext = isDefaultValueJpath
        ? getDataFromContext(defaultValue, hookContext)
        : defaultValue;
    } //endOf default value undefined

    //if this parameter is still undefined :
    if (typeof valueFromContext === "undefined" || valueFromContext === null) {
      //but optional:
      if (isDataOptional) {
        try {
          //return undefined as value of this label(note: check that no operations are acted upon this value)
          dataPathMap.set(aDataPathObject_label, undefined);
        } catch (error) {
          throw new ErrorHandler(
            500,
            `MongoDB: In parameter ${mongodbDoc[paramName]}, data Object ${aDataPathObject_label} could not have been added to the dataPathMap. We get the following error: ${error}`
          );
        }

        //then continue to next iteration
        continue;
      } else {
        //if mandatory, end process and send error
        throw new ErrorHandler(
          500,
          `MongoDB: In parameter ${mongodbDoc[paramName]}, data Object ${aDataPathObject_label} is required yet its value could not be extracted from the request neither a default value is specified in the template.`
        );
      }
    }

    //TODO: when extending with prefetch, if mandatory but prefetch true dont throw error

    logger.info(
      `dataPath object with label: ${aDataPathObject_label} has as initial value from hook context ${JSON.stringify(
        valueFromContext
      )}`
    );

    /// DATA HAS ALREADY BEEN EXTRACTED ///

    //typing the extracted data if not undefined
    if (typeof valueFromContext !== "undefined") {
      valueFromContext = typePathVal(
        aDataPathObject_datatype,
        valueFromContext
      );
      try {
        //add value to instance of Map associating labels (from dataPathObject list) to extracted values
        dataPathMap.set(aDataPathObject_label, valueFromContext);
      } catch (error) {
        throw new ErrorHandler(
          500,
          `MongoDB: In parameter ${mongodbDoc[paramName]}, data Object ${aDataPathObject_label} could not have been added to the dataPathMap. We get the following error: ${error}`
        );
      }
    }
  }
}

/**
 * find and extract data from context using JSONATA
 * @param {string} jsonpath path to values
 * @param {object} contextObj hook context
 * @returns {object} output
 */
function getDataFromContext(jsonpath, contextObj) {
  if (typeof jsonpath === "undefined" || jsonpath === null)
    throw new ErrorHandler(
      500,
      "no JSONata query expression has been inserted in the document."
    );

  if (jsonpath.trim() === "")
    throw new ErrorHandler(500, "JSONata query expression is an empty String.");

  //compiled path expression
  let expression = jsonata(jsonpath);

  //evaluate expression against JSON structure
  let resp;
  try {
    resp = expression.evaluate(contextObj);
  } catch (error) {
    throw new ErrorHandler(
      500,
      `function getDataFromContext 1: Error when parsing context ${contextObj} with jsonata expression ${jsonpath}.`
    );
  }

  //check does not start with error
  if (typeof resp !== "undefined" && !Array.isArray(resp)) {
    if (typeof resp === "string" && resp.startsWith("Error:"))
      throw new ErrorHandler(
        500,
        `function getDataFromContext 2: Error when parsing context ${contextObj} with jsonata expression ${jsonpath}.`
      );
  }

  return resp;
}

/**
 * Convert values to specified type
 * @param {Array} value array or primitive value extracted from resource
 * @return {Array} dataInXpath
 */
function typePathVal(typepath, value) {
  //jif undefined, return it
  if (typeof value === "undefined") return value;
  //if user-defined type is = object then return the value as it is
  if (typePath === 'object') return value;

  //number of iterations to do on the switch command.
  //one is default as the first one is mandatory by using do-while loop
  let iters = 1;

  //if of type array then add values to array. If not, do it just once
  //is it an array path?
  let isArrayData = Array.isArray(value);

  //array to make calculations
  let resultArr;
  //we are expecting an Array of primitive values. Array of Arrays will not work
  if (isArrayData) {
    //iterations equal to length of array
    iters = value.length;
    resultArr = value;
  } else {
    //if not an array, wrap into an array for consistency in function application below.
    resultArr = new Array(value);
  }

  do {
    let tempVal = resultArr[iters - 1];
    //logger.info("tempVal at typing process is " + tempVal);

    try {
      // values may not be convertable due to erroneous typing

      //logger.info(`value at  path is ${JSON.stringify(temp)}`);
      //if type of value is not String, then change type as specified
      switch (typepath) {
        case "date":
          resultArr[iters - 1] = new Date(tempVal); //TODO: check this typing is generic enough
          break;
        case "number":
          tempVal = Number(tempVal);
          //test conversion to number was successsful
          if (Number.isNaN(tempVal))
            throw Error(`value ${resultArr[iters - 1]} is not of Number type`);
          resultArr[iters - 1] = tempVal;
          break;
        case "boolean":
          resultArr[iters - 1] = tempVal >= 1; //null,undefined are false.
          break;
        case "string":
          resultArr[iters - 1] = "" + tempVal;
          break;
        default: //object type or any other
        resultArr[iters - 1] = tempVal;
        break;
      }
    } catch (error) {
      throw new ErrorHandler(
        500,
        `Error in function typePathVal: type: ${typepath} and value: ${value}: ${error.message}`
      );
    }

    //iterate
  } while (--iters > 0);

  //if initial data was not an array, unwrap it from the array we created
  return !isArrayData ? resultArr[0] : resultArr;
}

//TODO: if FHIR instances not found or elements within, this method throws an Error. Is it too tight?
/**
 * Given a list of form {resourceType}/{id} from the hook context, it finds FHIR instances within the data matching the given values.
 * @param {object} hookContext hook Context
 * @param {Array} refsList list of references of form ResourceType/id
 * @param {object} actObj object findRef action definition from eform in Fetch Doc
 * @returns Array with specified parts of the matched FHIR instances as given by the JPath in the action object
 * where varRType and varId are a pair of variables in the JPath to be replaced by each {resourceType} and {id}, respectively.
 */
async function findReferencesInContext(hookContext, refsList, actObj) {
  //check for properties
  if (
    !(
      actObj.hasOwnProperty(details) ||
      actObj[details].hasOwnProperty(xpath) ||
      actObj[details].hasOwnProperty(typePath) ||
      actObj[details].hasOwnProperty(arg1)
    )
  )
    throw handleError(
      500,
      `property ${details} is missing  property ${xpath} or ${typePath} or ${arg1} in object actions on eform`
    );

  //JSONpath is expected to be written with 2 placeholders: var1 and var2
  let xPathStr = actObj[details][xpath];
  //data typing of results
  let typing = actObj[details][typePath];

  //list of results that will replace the list of arguments at the given index of the general argsList array
  let tempList = new Array();

  //for each reference
  for (const refString of refsList) {
    //replace var1 and var2 by refString parts
    let refWords = refString.split("/"); //so Patient/example -> [Patient, example]

    //find value in Path.
    //replace placeholders by FHIR ResourceType and FHIR Id
    let pathStr = xPathStr
      .replace("varRType", `'${refWords[0]}'`)
      .replace("varId", `'${refWords[1]}'`);
    logger.info(`FindRef: Jpath string is ${pathStr}.`);

    let res = getDataFromContext(pathStr, hookContext);

    //TODO: is it too tight to throw an error if reference is not found on hook context
    if (!res || typeof res === undefined || res === null)
      throw new ErrorHandler(
        500,
        `Function reference finder has not been able to find the reference in the context using the specified data from MongoDB`
      );

    //add to temp list
    tempList.push(res);
  } //endOf loop

  //flatten list with found referenced values
  tempList = flat(tempList, 1);

  //typing of values
  //replace args with new data list
  return typePathVal(typing, tempList);
}

/**
 * Given a term, it applies as a key to fetch the value referenced as part of the Map built from the dataPath array. If no object is referenced by the term, it returns the term itself.
 * @param {Map} dataPathMap Map structure containing dataPathObjects values referenced by their label
 * @param {String} key to obtain value in Map
 */
function fetchArgumentVal(dataPathMap, key) {
  return dataPathMap.has(key) ? dataPathMap.get(key) : key;
}

/**
 * validate arguments can be compared and manipulate them to achieve a valid comparison, if possible (e.g., remove values from singleton arrays to compare them, then check the type of both is the same)
 * @param {any} arg1 arg1
 * @param {any} arg2 arg2
 * @param {String} symbol comparison symbol
 * @returns an object with fields arg1 and arg2
 */
function validateComparisonArgs(arg1, arg2, symbol) {
  let firstArg = arg1;
  let secondArg = arg2;

  switch (symbol) {
    case "getYearsFromNow":
    case "calculate_age":
      if (Array.isArray(firstArg) && firstArg.length === 1) {
        firstArg = arg1[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (
          Array.isArray(firstArg) &&
          (firstArg.length < 1 || firstArg.length > 1)
        )
          throw handleError(
            500,
            `A function action with symbol ${symbol} has unexpectedly found more than one value on arg1: ${JSON.stringify(
              arg1
            )}.`
          );
      }
      break; //TODO: update checks and move funcxtion checks to function module
    case In:
      //arg1 must be a singleton or primitive val
      //arg2 must be an array
      if (Array.isArray(firstArg) && firstArg.length === 1) {
        firstArg = arg1[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (
          Array.isArray(firstArg) &&
          (firstArg.length < 1 || firstArg.length > 1)
        )
          throw handleError(
            500,
            `A comparison action with symbol 'in' has unexpectedly found more than one value on arg1: ${JSON.stringify(
              arg1
            )}.`
          );
      }
      if (!Array.isArray(secondArg))
        throw new ErrorHandler(
          500,
          `A comparison action with symbol 'in' is expecting an array as arg2 but found : ${JSON.stringify(
            secondArg
          )}.`
        );
      break;
    case "isSubsetOf":
    case "arr_diff_nonSymm":
      //arg1 must be an array
      //arg2 must be an array
      if (!Array.isArray(firstArg))
        throw new ErrorHandler(
          500,
          `A comparison action with symbol ${symbol} is expecting an array as arg1 but found : ${JSON.stringify(
            firstArg
          )}.`
        );
      if (!Array.isArray(secondArg))
        throw new ErrorHandler(
          500,
          `A comparison action with symbol ${symbol} is expecting an array as arg2 but found : ${JSON.stringify(
            secondArg
          )}.`
        );
      break;
    default:
      //To compare 2 values taken from the pathList,

      //we expect at most one singleton array or a primitive value; otherwise it is an error
      //if singleton array, fetch value else error
      if (Array.isArray(firstArg) && firstArg.length === 1) {
        firstArg = firstArg[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (Array.isArray(firstArg))
          throw handleError(
            500,
            `Function validateComparisonArgs: a comparison action with symbol ${symbol} has unexpectedly found an Array (of size greater than 1) : ${JSON.stringify(
              firstArg
            )} as arg1 value.`
          );
      }

      if (Array.isArray(secondArg) && secondArg.length === 1) {
        secondArg = secondArg[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (Array.isArray(secondArg))
          throw new ErrorHandler(
            500,
            `Function validateComparisonArgs: a comparison action with symbol ${symbol} has unexpectedly found an Array (of size greater than 1) : ${JSON.stringify(
              secondArg
            )} as arg2 value.`
          );
      }

      //comparisons must be done between 2 objects of the same type
      //
      let typeOfArg1 = _typeOf(firstArg);
      let typeOfArg2 = _typeOf(secondArg);
      if (typeOfArg1 !== typeOfArg2) {
        throw new ErrorHandler(
          500,
          `Function validateComparisonArgs. comparison not applicable: distinct data types are being compared ${firstArg}:${typeOfArg1} and ${secondArg}:${typeOfArg2}.`
        );
      }
      break;
  }

  return { firstArg: firstArg, secondArg: secondArg };
}

/*** Applies user defined functions or actions between data extracted from hook context.
 * Order of application matters.
 * @param {object} hookCntxtObj hook context with resources. To be used on a reference find
 * @param {array} processingActions array with functions
 * @param {Map} dataPathMap map with data extracted from hook context referenced by dataDataPathObjects' parameter field
 */
async function applyActions(hookCntxtObj, processingActions, dataPathMap) {
  //if empty, there are no actions on queried data to be applied at this moment
  if (Array.isArray(processingActions) && processingActions.length === 0)
    return;

  //apply actions to values in list of arguments
  for (const anAction of processingActions) {
    //name of function
    let anActionLabel;

    //check for properties action and details
    if (anAction.hasOwnProperty(action) && anAction.hasOwnProperty(details)) {
      //if it is labelled as function, take the function symbol as operator otherwise use the action name
      anActionLabel =
        anAction[action] === functLabel
          ? anAction[details][symbol]
          : anAction[action];
    } else {
      throw new ErrorHandler(
        500,
        `property ${action} or ${details} are not found in object ${JSON.stringify(
          anAction
        )} on MongoDB collection.`
      );
    }

    logger.info(`applying action: ${anActionLabel}`);

    //parameter names used as arguments. We expect at most 2 arguments
    //their values can be references to dataPath objects or, for arg2, a primitive value
    let arg1Ref;
    let arg1Val;
    let arg2Ref;
    let arg2Val;
    let isArg1Ref,
      isArg2Ref = false;

    //test for consistent structure
    if (
      anAction.hasOwnProperty(details) &&
      anAction[details].hasOwnProperty(arg1)
    ) {
      //ref name of first argument
      arg1Ref = anAction[details][arg1];
      //value of first arg.
      //HEre the reference and the value could be the same as user-defined entry values are allowed
      arg1Val = fetchArgumentVal(dataPathMap, arg1Ref);
      //is arg1 NOT a reference? hence input from user
      isArg1Ref = !(arg1Ref === arg1Val);
      logger.debug(
        `Is arg1 in Action object a reference to datapath values? ${isArg1Ref}`
      );

      //test for a second argument
      //is arg1 NOT a reference? hence input from user
      //False by default since there may be no arg2 in the action object
      if (
        anAction.hasOwnProperty(details) &&
        anAction[details].hasOwnProperty(arg2)
      ) {
        arg2Ref = anAction[details][arg2];
        //value of second arg. HEre the reference and the value could be the same as user-defined entry values are allowed
        //value of second arg
        arg2Val = fetchArgumentVal(dataPathMap, arg2Ref);
        //is arg1 NOT a reference? hence input from user
        isArg2Ref = !(arg2Ref === arg2Val);
        logger.debug(
          `Is arg2 in Action object a reference to datapath values? ${isArg2Ref}`
        );
      }
    } else {
      throw new ErrorHandler(
        500,
        `field ${details} or ${arg1} is not found in the actions array of the MongoDb document.`
      );
    }

    //this var will contain the resulting value, after function application, to replace the initial arguments
    let newVal;

    ///begin with comparison between arguments. resulting boolean value is stored in first given argument, ie., lhs arg
    //the rhs argument must be nullified so that it does not show in the reply//TODO: does it need to be nullified?or kept for other actions to use?
    //then user-defined functions
    switch (anActionLabel) {
      case parentOf:
      case parentOrSelfOf:
      case childOf:
      case childOrSelfOf:
      case descendantOrSelfOf:
      case descendantOf:
      case ancestorOrSelfOf:
      case ancestorOf:
        //no arg2 expected on this actions
        //value of arg1 could be an array of codes to apply operator
        try {
          let response = await getSnomedQueryResult(anAction, arg1Val);

          //for each elem in response, apply jsonata
          //check that no errors are in the response from jsonata application
          //flatten array with resulting codes
          /*let resVals = response.map((contextArr) => {
            //extract singleton elem from array response
            let context = Array.isArray(contextArr)
              ? contextArr[0]
              : contextArr;
            let res = getDataFromContext(jsonEclQueryExpr, context);
            logger.info("res is " + JSON.stringify(res));
            //if contains error, throw
            if (JSON.stringify(res).startsWith("Error:"))
              throw new Error(JSON.stringify(res));
            //else return value
            return res;
          });
          //flatten all responses into one array
          resVals = flat(resVals);
          //if singleton, return elemnt at index 0
          newVal = resVals.length === 1 ? resVals[0] : resVals; */
          response = flat(response, 2);

          newVal = response.length === 1 ? response[0] : response;
        } catch (error) {
          throw new ErrorHandler(500, error.message ? error.message : error);
        }

        break;
      ////////
      case findRef: //tested
        //find Resources in context from a list of given references
        //find ref
        newVal = findReferencesInContext(hookCntxtObj, arg1Val, anAction);

        logger.info(
          `FindRef: arg1 reference: ${arg1Ref} has selection ${arg1Val}. Referenced value(s) is ${newVal}.`
        );
        break;
      /////////////
      case comparison: //tested
        //only if 2 args are given
        if (typeof arg2Val === "undefined" || arg2Val === null)
          throw new ErrorHandler(
            500,
            `Method ApplyActions. Comparison action not applied: second argument (arg2), either a dataPath reference or a value, is missing.`
          );
        //comparison sign
        let comparisonSymbol = anAction[details][symbol];
        //validate arguments before comparison
        let { firstArg, secondArg } = validateComparisonArgs(
          arg1Val,
          arg2Val,
          comparisonSymbol
        );

        //compare with respect to symbol
        switch (comparisonSymbol) {
          case "eq":
            newVal = firstArg === secondArg;
            //TODO: if ofType Date, lhsArg.getTime() === rhsArg.getTime()
            break;
          case "lt":
            newVal = firstArg < secondArg;
            break;
          case "lte":
            newVal = firstArg <= secondArg;
            break;
          case "gt":
            newVal = firstArg > secondArg;
            break;
          case "gte":
            newVal = firstArg >= secondArg;
            break;
          case "neq":
            newVal = firstArg !== secondArg;
            //TODO: if ofType Date, lhsArg.getTime() !== rhsArg.getTime()
            break;
        }
        break;
      ////////////////
      case In: //tested
        //all elems in first arg are included in second arg
        let args = validateComparisonArgs(arg1Val, arg2Val, In);
        arg1Val = args.firstArg;
        arg2Val = args.secondArg;

        if (Array.isArray(arg1Val)) {
          let boolRes = arg1Val.map((elem) => arg2Val.includes(elem));
          //all resuls must be true
          newVal = boolRes.every(Boolean);
        } else {
          newVal = arg2Val.includes(arg1Val);
        }
        break;
      //////
      case contains:
        newVal = secondArg.every((val) => firstArg.includes(val));
        break;
      ///////
      case subsumes: //strict operator: all lhs values must subsume at least one value in the rhs
        logger.info("CASE:subsumes");
        //check each value is a numeric string (SNOMEDCT)
        //convert to array
        if (!Array.isArray(arg1Val)) arg1Val = [arg1Val];
        if (arg1Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetched values for field arg1 in action object from actions array are not numeric (check input data from hook context or database input). Action object is: " +
              JSON.stringify(anAction)
          );
        //arg2 expected
        if (!Array.isArray(arg2Val)) arg2Val = [arg2Val];
        if (arg2Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetched values for field arg1 in action object from actions array are not numeric (check input data from hook context or database input). Action object is: " +
              JSON.stringify(anAction)
          );
        //value of arg1 or arg2 could be an array of codes to apply operator
        try {
          let response = await getSnomedQueryResult(anAction, arg1Val, arg2Val);
          //for each arr in array response,
          //at least one elem must be successful:
          //apply jsonata
          //check that no errors are in the response from jsonata application
          //flatten array with resulting codes
          let resVals = response.map((contextArr) => {
            let boolRes;
            for (let index = 0; index < contextArr.length; index++) {
              /* const temp = contextArr[index];
              let temp = getDataFromContext(jsonIsaExpr, context);
              //check for errors
              if (temp.startsWith("Error:")) throw new Error(temp);
              //check for subsumption string
              temp = temp === "subsumes" ? true : false; */
              let boolTemp = contextArr[index] === "subsumes" ? true : false;
              //at least one elem must be in the subsumption relation
              boolRes = index === 0 ? boolTemp : boolRes || boolTemp;
            } //endOf for
            return boolRes;
          });
          //all boolean results must be true
          newVal = resVals.every(Boolean);
        } catch (error) {
          throw new ErrorHandler(500, error.message);
        }
        break;
      //////////////
      case subsumesOrEq: //strict operator
        logger.info("CASE: subsumesOrEq");
        //check each value is a numeric string (SNOMEDCT)
        //convert to array
        if (!Array.isArray(arg1Val)) arg1Val = [arg1Val];
        if (arg1Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetched values for field arg1 in action object from actions array are not numeric (check input data from context). Action object is: " +
              JSON.stringify(anAction)
          );
        //arg2 expected
        if (!Array.isArray(arg2Val)) arg2Val = [arg2Val];
        if (arg2Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetch values from the data path input array are not numeric. Action object is: " +
              JSON.stringify(anAction)
          );
        //value of arg1 or arg2 could be an array of codes to apply operator
        try {
          let response = await getSnomedQueryResult(anAction, arg1Val, arg2Val);
          //for each arr in array response,
          //at least one elem must be successful:
          //apply jsonata
          //check that no errors are in the response from jsonata application
          //flatten array with resulting codes
          let resVals = response.map((contextArr) => {
            let boolRes;
            for (let index = 0; index < contextArr.length; index++) {
              const context = contextArr[index];
              /*let temp = getDataFromContext(jsonIsaExpr, context);
              //check for errors
              if (temp.startsWith("Error:")) throw new Error(temp);
              //check for subsumption string
              temp =
                temp === "subsumes" || temp === "equivalent" ? true : false;*/
              let temp =
                context === "subsumes" || context === "equivalent"
                  ? true
                  : false;
              //at least one elem must be in the subsumption relation
              boolRes = index === 0 ? temp : boolRes || temp;
            }
            return boolRes;
          });
          //all boolean results must be true
          newVal = resVals.every(Boolean);
        } catch (error) {
          throw new ErrorHandler(500, error.message);
        }
        break;
      //tested
      case filterByClass: // filter elements that are subsumed-by or equivalent to given constraint-based codes
        logger.info("CASE: filterByClass");
        //check each value is a numeric string (SNOMEDCT)
        //convert to array
        if (!Array.isArray(arg1Val)) arg1Val = [arg1Val];
        if (arg1Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetch values from the data path input array are not numeric. Action object is: " +
              JSON.stringify(anAction)
          );
        //arg2 expected
        if (!Array.isArray(arg2Val)) arg2Val = [arg2Val];
        if (arg2Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetch values from the data path input array are not numeric. Action object is: " +
              JSON.stringify(anAction)
          );
        //value of arg1 or arg2 could be an array of codes to apply operator
        try {
          let response = await getSnomedQueryResult(anAction, arg1Val, arg2Val);
          //for each arr in array response,
          //at least one elem must be successful:
          //apply jsonata
          //check that no errors are in the response from jsonata application

          //response is of size arg1Val.length and contextArr is of size arg2Val.length
          let arg1Val_index = -1;

          let resVals = response.map((contextArr) => {
            let boolRes;
            for (let index = 0; index < contextArr.length; index++) {
              const context = contextArr[index];
              /* let temp = getDataFromContext(jsonIsaExpr, context);
              //check for errors
              if (temp.startsWith("Error:")) throw new Error(temp);
              //check for subsumption string*/
              logger.debug("filterByClass value is " + JSON.stringify(context));
              let temp =
                context === "subsumed-by" || context === "equivalent"
                  ? true
                  : false;
              //at least one elem must be in the subsumption relation
              boolRes = index === 0 ? temp : boolRes || temp;
            } //end for loop

            // logger.debug('boolRes is ' + JSON.stringify(boolRes));
            //increase index of arg1Val
            ++arg1Val_index;
            //if true then return codeA at index else null
            return boolRes ? arg1Val[arg1Val_index] : null;
          });

          //logger.debug('resVals is ' + JSON.stringify(resVals));
          //filter nulls from list. If all nulls return empty list
          newVal = resVals.filter((val) => val !== null);
        } catch (error) {
          throw new ErrorHandler(500, error.message);
        }
        break;
      /////////////
      //user-defined functions. to be named here to activate them.
      default:
        logger.info("CASE: user-defined functions");
        ///name of user-defined functions. Extend by adding label and how to apply function//
        newVal = applyUserDefinedFunct(anActionLabel, arg1Val, arg2Val);
        logger.info(
          `Function: function ${anActionLabel} returns ${JSON.stringify(
            newVal
          )}.`
        );
        break;
    } //endOf main Switch

    //replace argument with resulting value
    //if arg1 is not in datapath (hence user input) then try with arg2.
    //if arg2 is not in datapath (hence user input) then throw error
    let refArg = isArg1Ref ? arg1Ref : isArg2Ref ? arg2Ref : false;
    //if no references, throw error
    if (!refArg)
      throw ErrorHandler(
        500,
        `action ${anActionLabel} does not have references in field arg1 or arg2 to input data in dataPaths array for action object from database: ${JSON.stringify(
          anAction
        )}`
      );
    logger.debug(
      `The referencing variable in the action object is labelled as ${refArg}`
    );
    //update referenced value with result
    dataPathMap.set(refArg, newVal);
    logger.info(
      `DataPathMap with key: ${refArg} is being updated to value: ${JSON.stringify(
        dataPathMap.get(refArg)
      )}.`
    );
  } //endOfLoop

  //arguments are arrays so pass-by-ref, hence no need to return changes
}

/**
 *
 * @param {Model} model MongoDB model
 * @param {String} keyParam parameter name
 * @param {Map} datapathMap datapath values
 * @param {Array} constraintActions actions applied to output
 * @param {Array} constraints output as taken from MOngoDb document
 * @param {String} datapathFirstElem_lbl label of first element in dataPaths array
 * @returns {Array} Array of results
 */
async function evaluateConstraints(
  model,
  keyParam,
  datapathMap,
  constraintActions, //constraint satisfaction actions
  constraints
) {
  //SPECIAL CASES

  //check output array is empty
  let isOutputEmpty =
    constraints.length === 0 || typeof constraints === "undefined";

  //if there are actions to be applied but no outcomes then this is an error
  if (constraintActions.length > 0 && isOutputEmpty) {
    throw new ErrorHandler(
      500,
      `Constraint satisfaction actions cannot be evaluated because constraints list is empty or missing parameters. Parameter = ${keyParam}.`
    );
  }

  //now for each specific action:

  //if arg at index i in argsPathList is undefined, got to i + 1 arg
  //undefined here is taken as an optional element where we have no data, so it should not alter the flow.
  //TODO: LHS could also have wildcards to denote any result is Ok. How to handle that?

  let conditionList = new Array();

  //for each constraint action in this document
  for (const aConstraintAction of constraintActions) {
    //fetch lhs (arg1) and rhs (arg2) values as args.
    //Currently, we operate with 2 arguments, one from the output object to be compared with
    //and another from the possibly modified data path value(s). This is an array and it may contain more than
    //one argument. If so, it means a comparison between arguments was already done and the result has been
    //stored in argument at index 0

    //check  properties exist within the action object
    if (
      !(
        aConstraintAction.hasOwnProperty(details) ||
        aConstraintAction[details].hasOwnProperty(arg1) ||
        aConstraintAction[details].hasOwnProperty(arg2)
      )
    )
      throw new ErrorHandler(
        500,
        `Expected properties are missing from the actionList on the DB template for outcome related operations`
      );

    //fetch their indices first:

    //the constraint label
    let arg2Key = aConstraintAction[details][arg2];

    //the key for fetching the lhs argument from dataPaths
    let arg1Key = aConstraintAction[details][arg1];

    //Next, use the lhs index to get the value for the lhs. Note that rhs could have many results to select from
    let arg1_val = fetchArgumentVal(datapathMap, arg1Key);

    //get the name of the operation
    let actionName = aConstraintAction[action];

    //If name of the operation is comparison, replace by the comparison operation sign
    if (actionName === Qomparison) {
      //check  properties exist within the action object
      if (!aConstraintAction[details].hasOwnProperty(symbol))
        throw new ErrorHandler(
          500,
          `Expected property ${symbol} is missing from a Qomparison in the hook context processing document.`
        );
      //replace with given comparison sign
      actionName = aConstraintAction[details][symbol];
    }

    ///now construct the query//

    //projection field
    //this is the constraint value as arg2 reference
    let aConstraintParamElem = `$$constraintsList.${queryArgs}.${arg2Key}`;

    //object for the comparison
    let compObj; //TODO: comparison between 2 params and then result

    //at this point we have as valueAtPathIndex an array w length > 1 or a primitive value
    switch (actionName) {
      case isA:
      case hasA:
      case isAOrEq:
      case hasAOrEq:
        //dont add results to dataPath but use directly as other subsumptions could use the same values
        //retrieve all values from the constraint object in output for this arg2 key
        let constraintCodes = constraints.map(
          (constr) => constr[queryArgs][arg2Key]
        );
        logger.debug(`${actionName}: var constraintCodes is ${JSON.stringify(constraintCodes)}`);
        //flatten result as it could have arrays and remove repeated vals
        constraintCodes = [...new Set(flat(constraintCodes))];

        //check all values are numeric
        if (constraintCodes.some(isNaN))
          throw new ErrorHandler(
            500,
            `Some constraint SNOMED codes (${JSON.stringify(
              constraintCodes
            )}) are not numeric when unpacking ${JSON.stringify(
              aConstraintAction
            )}`
          );
        //function takes an array for codes so check arg1 is array or wrap into array
        if (!Array.isArray(arg1_val)) arg1_val = [arg1_val];

        if (arg1_val.some(isNaN))
          throw new ErrorHandler(
            500,
            `Some value(s) from arg1 (${arg1_val}) are not numeric when unpacking ${JSON.stringify(
              aConstraintAction
            )}`
          );
          logger.debug(`${actionName}: var arg1_val is ${JSON.stringify(arg1_val)}`);
        //now we have an array with all the values unique from the constraint object for arg2
        //for each value in array arg1, resolve the subsumption query
        let results = await getSnomedQueryResult(
          aConstraintAction,
          arg1_val,
          constraintCodes
        );
        logger.debug(`${actionName}: var results is ${JSON.stringify(results)}`);

        //apply jsonata to results (array of array)
        //for each context in array of arrays, apply jsonata query
        //if 'error:' in response of one getDataFromContext application then error thrown
        results = results.map((arr) => {

          //this array must have same length as constraints array
          if (arr.length !== constraintCodes.length)
            throw new ErrorHandler(
              500,
              `constraints array is not the same length as array with results from querying SNOMED browser in action ${JSON.stringify(
                aConstraintAction
              )} where  values are : ${JSON.stringify(
                arr
              )} and : ${JSON.stringify(constraintCodes)}.`
            );

          let validCodes = new Array();

          //test for subsumption or equivalent, depending on the case, for each code in the array
          for (let index = 0; index < arr.length; index++) {
            //result of subsumption relation
            const subsumptionString = arr[index];
            //code from constraint that was applied as arg2 in the subsumption relation
            const code = constraintCodes[index];

            //boolean value or throws error
            //const strVal = elem; //getDataFromContext(jsonIsaExpr, arr[index]);
            //check for each operation
            if (
              (actionName === isA && subsumptionString === "subsumed-by") ||
              (actionName === isAOrEq &&
                (subsumptionString === "subsumed-by" || subsumptionString === "equivalent")) ||
              (actionName === hasA && subsumptionString === "subsumes") ||
              (actionName === hasAOrEq &&
                (subsumptionString === "subsumes" || subsumptionString === "equivalent"))
            )
            validCodes.push(code);

          }//endOf loop
          //return array w responses
          return validCodes;
        });

        //flatten potential arrays of codes from arg2 and remove duplicates
        results = [...new Set(flat(results))];
        logger.debug(`isA: var results is updated to ${JSON.stringify(results)}`);

        //then evaluate results by comparing with constraint values
        //it could be one code or an array of codes
        //if array, the evaluation is satisfied ONLY if all queries are satisfied
        //this is done by checking if the values added to results also appear as constraint values
        //TODO: evaluate an array of constraints for satisfiability so that if some are satisfiable then it is satisfiable
        //$anyElementTrue
        compObj = {
          $cond: {
            if: { $isArray: aConstraintParamElem },
            then: { $setIsSubset: [aConstraintParamElem, results] },
            else: { $in: [aConstraintParamElem, results] },
          },
        };
        break;
      ////////////////////////////
      case "eq":
        compObj = {
          $eq: [arg1_val, aConstraintParamElem],
        };
        break;
      case "neq":
        compObj = {
          $not: [
            {
              $eq: [arg1_val, aConstraintParamElem],
            },
          ],
        };
        break;
      case "gte":
        if (Array.isArray(arg1_val) && arg1_val.length === 1)
          arg1_val = arg1_val[0];
        compObj = {
          $gte: [arg1_val, aConstraintParamElem],
        };
        break;
      case "gt":
        if (Array.isArray(arg1_val) && arg1_val.length === 1)
          arg1_val = arg1_val[0];
        compObj = {
          $gt: [arg1_val, aConstraintParamElem],
        };
        break;
      case "lte":
        if (Array.isArray(arg1_val) && arg1_val.length === 1)
          arg1_val = arg1_val[0];
        compObj = {
          $lte: [arg1_val, aConstraintParamElem],
        };
        break;
      case "lt":
        if (Array.isArray(arg1_val) && arg1_val.length === 1)
          arg1_val = arg1_val[0];
        compObj = {
          $lt: [arg1_val, aConstraintParamElem],
        };
        break;
      case isIncluded:
        //if arg1 is an array of size > 1, error
        if (Array.isArray(arg1_val) && arg1_val.length > 1)
          throw new ErrorHandler(
            500,
            `Constraint action : ${actionName} has arg1 of type array and size greater than 1, when only one element was expected.`
          );
        //if size is 1 just remove the element
        if (Array.isArray(arg1_val) && arg1_val.length === 1)
          arg1_val = arg1_val[0];
        compObj = { $in: [arg1_val, aConstraintParamElem] };
        break;
      case includes: //previously inLhs //TODO: restrict constraint to non-array value
        if (!Array.isArray(arg1_val)) arg1_val = [arg1_val];
        compObj = { $in: [aConstraintParamElem, arg1_val] };
        break;
      case isSupersetOf:
        if (!Array.isArray(arg1_val)) arg1_val = new Array(arg1_val);
        compObj = { $setIsSubset: [aConstraintParamElem, arg1_val] };
        break;
      case isSubsetOf:
        if (!Array.isArray(arg1_val)) arg1_val = new Array(arg1_val);
        compObj = { $setIsSubset: [arg1_val, aConstraintParamElem] };
        break;
      case anyElemIn: //tested
        //if arg1 is not an array, error
        if (!Array.isArray(arg1_val))
          throw new ErrorHandler(
            500,
            `Constraint action : ${actionName} must have an array as arg1 and each of the constraints referenced by arg2.`
          );
        let inList = new Array();

        //for each element in array arg1, check the element is included. 
        //Join them by an $or operator to find final result
        for (let index = 0; index < arg1_val.length; index++) {
          const element = arg1_val[index];
          //add a list of element is included in
          inList.push({ $in: [element, aConstraintParamElem] });
        }
        //return a list of 'or' operations if greater than 1
        compObj = inList.length > 1 ? { $or: inList } : inList[0];
    } //endOf switch

    //add elemMatch to object
    conditionList.push(compObj);
    //logger.info("Condition is " + JSON.stringify(compObj));
  } //end of loop

  let conditionObj =
    conditionList.length > 1 ? { $and: conditionList } : conditionList[0];

  logger.info(
    "ConditionList sent to MongoDB is " + JSON.stringify(conditionObj)
  );

  let mergedOutputVals;

  //query databse
  try {
    let outputLists = await model.aggregate([
      { $match: { [paramName]: keyParam } },
      {
        $project: {
          matchedItems: {
            $filter: {
              input: `$${outputArray}`,
              as: "constraintsList",
              cond: conditionObj,
            },
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          _output: {
            $addToSet: `$matchedItems.${outcome}`,
          },
        },
      },
    ]);
    //always returns a list of output elements even when output is not am array.
    //flatten merged output by 1 layer down max so outputs of form [[a,b],[c,d]] are preserved
    //however, output forms must also be preserved at the level of constraint arrays, i.e. all output must have same form.
    mergedOutputVals = flat(outputLists[0]._output[0], 1);
  } catch (error) {
    logger.error(
      `object ${keyParam} failed  to convert results using the DB:  ${error}`
    );
    throw error;
  }
  logger.info(`mergedResults Array is ${JSON.stringify(mergedOutputVals)}`);
  //add to Map
  //if singleton, returns value. if empty string (hence no constraints matched), return null
  if (mergedOutputVals.length <= 1) {
    mergedOutputVals = mergedOutputVals.length < 1 ? null : mergedOutputVals[0];
  }
  return mergedOutputVals;
}

export {
  getDataPointValues,
  evaluateConstraints,
  applyActions,
  collectActionsFromDocument,
  callCdsServicesManager,
  getNoConstraintsResult
};
