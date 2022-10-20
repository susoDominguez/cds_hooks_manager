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
  parentOf,
  parentOrSelfOf,
  childOf,
  childOrSelfOf,
  descendantOrSelfOf,
  descendantOf,
  ancestorOrSelfOf,
  ancestorOf,
  codeSys,
  termSys,
  count,
  filterTerm,
} from "../database/constants.js";
import flat from "array.prototype.flat";
import {
  arr_diff_nonSymm,
  calculate_age,
  getYearsFromNow,
} from "../lib/user-defined-functions.js";
import { ErrorHandler } from "../lib/errorHandler.js";
import logger from "../config/winston.js";
import mongoosePackg from "mongoose";
const { Model } = mongoosePackg;
//const got from "got");
import axios from "axios";
import {
  default as getSnomedQueryResult,
  jsonEclQueryExpr,
  jsonIsaExpr,
} from "../snomedct/ecl.js";
//const qs from "querystring";
const {
  CDS_SERVICES_MS_HOST,
  CDS_SERVICES_MS_PORT
} = process.env;
//cds services manager url
//not using SSL yet
const url_CdsServices = `http://${CDS_SERVICES_MS_HOST}:${CDS_SERVICES_MS_PORT}/cds-services/`;
///////////////////////////////////////////////////////
/**
 *
 * @param {string} hookId
 * @param {string} cigId
 * @param {Map} data
 * @returns response from cds services manager microservice
 */
async function callCdsServicesManager(hookId, cigId, reqData) {

  const cigModel = hookId + ( (typeof cigId !== 'undefined') ? `/cigModel/${cigId}` : ``);
  //construct URL
  const baseURL = url_CdsServices + cigModel;

  //create config
  let config = {
    method: "post",
    url: baseURL,
    headers: {
      "Content-Type": "application/json"
    },
    data: reqData,
  };
  try {
    const response = await axios(config);
    if (response.status >= 400)
      throw new ErrorHandler(
        500,
        "Oops. Something went wrong! Try again please."
      );
    return response.data;
  } catch (err) {
    throw new ErrorHandler(
      500,
      "post request in callCdsServicesManager fail: " +
        (err.response ? err.response.body : err)
    );
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
 * creates an object containing values and actions to be applied to values
 * @param {object} mongoDbDoc context as taken from request call
 * @returns {object} object containig values and functions to be applied to those values
 */
function addFunctionsFromTemplateToArgsObject(mongoDbDoc) {
  //get actions from MongoDb doc. If actions are undefined then return an empty array
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
        obj[action] === comparison
    ),
    //filter only comparisons with the outputArray; they have at most one argument form argList
    constraintActions: actionArray.filter(
      (obj) =>
        //not equal to any of the above elements apart from isAncestor_eq
        obj[action] === Qomparison ||
        obj[action] === "in" ||
        obj[action] === "inLhs" ||
        obj[action] === "isSubsetOf" ||
        obj[action] === "isSubsetOfLhs" ||
        obj[action] === "is_a" ||
        obj[action] === "has_a"
    ),
    //Map of arguments where the key is the parameter label and the value is the dataDataPathObject object.
    //To be extracted from clinical context as part of request
    dataPathObjectMap: new Map(),
    //Output list, potentially a list of constraint satisfaction objects to be compared with arguments for selecting zero or more outcomes if triggered.
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

  return actionsObject;
}

/**
 * Fetches parameter value from hook context using information on MongoDB doc. Then, adds parameter and associated value to an instance of Map
 * @param {object} contextObj context as taken from request
 * @param {object} docObj e-form object
 * @param {Map} dataPathMap Map from eform objects to returned values
 */
function getDataPointValues(contextObj, docObj, dataPathMap) {
  //Fetch parameters, type properly and add to MAP.
  //Then apply to already existing MAP object the actions for comparisons to find results
  //or the existing result if not comparison is needed
  //logger.info("dataPathMap size is " + dataPathMap.size);

  //Array containing list of objects with data points to be extracted:
  const dataPathsObjectsList = docObj[pathList];

  //recognise as array
  if (!Array.isArray(dataPathsObjectsList))
    throw new ErrorHandler(500, "field paths expected to be an array.");

  //for each path in pathList.
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
          docObj[paramName]
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
    //Also could be undefined on purpose to add user-defined values in default.
    let valueFromContext = jpathQueryExprs
      ? getDataFromContext(jpathQueryExprs, contextObj)
      : undefined;

    //if undefined, get the default value which could also be undefined or a JSONpath of the same type as the main one
    if (typeof valueFromContext === "undefined") {
      //get default value (possibly undefined)
      let defaultValue = aDataPathObject[defaultVal];
      //and check whether it is also a path to data in a resource
      // is it an array? convert into a JSON array
      if (("" + defaultValue).trim().startsWith("["))
        defaultValue = JSON.parse(defaultValue);

      //are we dealing with another JSONPath format?
      //TODO: Possibly add another property to confirm it is a JPath
      let isDefaultValueJpath =
        defaultValue && //defVal exists
        !Array.isArray(defaultValue) && //and is not an array
        //cds Hooks informational contexts
        (("" + defaultValue).startsWith("context") ||
          ("" + defaultValue).startsWith("prefetch") ||
          ("" + defaultValue).startsWith("$"));

      //if default is a path, apply Jsonpath otherwise return the value
      valueFromContext = isDefaultValueJpath
        ? getDataFromContext(defaultValue, contextObj)
        : defaultValue;
    } //endOf default value undefined

    //if this parameter is still undefined :
    if (typeof valueFromContext === "undefined") {
      //but optional:
      if (isDataOptional) {
        try {
          //return undefined as value of this label, to hold the position in the array of arguments
          dataPathMap.set(aDataPathObject_label, undefined);
        } catch (error) {
          throw new ErrorHandler(
            500,
            `MongoDB: In parameter ${docObj[paramName]}, data Object ${aDataPathObject_label} could not have been added to the dataPathMap. We get the following error: ${error}`
          );
        }

        //then continue to next iteration
        continue;
      } else {
        //if mandatory, end process and send error
        throw new ErrorHandler(
          500,
          `MongoDB: In parameter ${docObj[paramName]}, data Object ${aDataPathObject_label} is required yet its value could not be extracted from the request neither a default value is specified in the template.`
        );
      }
    }

    logger.info(
      `dataPath object with label: ${aDataPathObject_label} has as initial value from hook context ${JSON.stringify(
        valueFromContext
      )}`
    );

    /// DATA HAS ALREADY BEEN EXTRACTED ///

    //typing the extracted data
    valueFromContext = typePathVal(aDataPathObject_datatype, valueFromContext);
    try {
      //add value to instance of Map associating labels (from dataPathObject list) to extracted values
      dataPathMap.set(aDataPathObject_label, valueFromContext);
    } catch (error) {
      throw new ErrorHandler(
        500,
        `MongoDB: In parameter ${docObj[paramName]}, data Object ${aDataPathObject_label} could not have been added to the dataPathMap. We get the following error: ${error}`
      );
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
  if (jsonpath === undefined || jsonpath === null || jsonpath.trim() === "")
    return undefined;

  //compiled path expression
  let expression = jsonata(jsonpath);

  //evaluate expression against JSON structure
  let resp = expression.evaluate(contextObj);
  //check does not start with error
  if (resp && !Array.isArray(resp)) {
    if (typeof resp == "string" && resp.startsWith("Error:"))
      throw new ErrorHandler(
        500,
        `Error when parsing context ${contextObj} with jsonata expression ${jsonpath}.`
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
    //if not an array, wrap into an array for consistency in function application.
    resultArr = [];
    resultArr.push(value);
  }

  do {
    let tempVal = resultArr[iters - 1];
    //logger.info("tempVal at typing process is " + tempVal);

    //logger.info(`value at  path is ${JSON.stringify(temp)}`);
    //if type of value is not String, then change type as specified
    switch (typepath) {
      case "date":
        resultArr[iters - 1] = new Date(tempVal); //TODO: check this typing is generic enough
        break;
      case "number":
        resultArr[iters - 1] = Number(tempVal);
        break;
      case "boolean":
        resultArr[iters - 1] = tempVal >= 1; //null,undefined are false.
        break;
      case "string":
        resultArr[iters - 1] = "" + tempVal;
        break;
    }

    //iterate
  } while (--iters > 0);

  //if initial data was not an array, unwrap it from the array we created
  return !isArrayData ? resultArr[0] : resultArr;
}

/**
 *
 * @param {object} hookContext hook Context
 * @param {Array} refsList list of references of form ResourceType/id
 * @param {object} actObj object findRef action definition from eform in Fetch Doc
 * @returns array
 */
function findReferencesInContext(hookContext, refsList, actObj) {
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
      .replace("var1", refWords[0])
      .replace("var2", refWords[1]);
    logger.info(`path string is ${pathStr}`);
    let res = getDataFromContext(pathStr, hookContext);

    //TODO: is it too tight to throw an error if reference is not found on hook context
    if (!res)
      throw new ErrorHandler(
        500,
        `Function reference finder has not been able to find the reference in the context using the specified data from MOngoDB`
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
 * Using a given object, fetch value in Map using object as key, else object is value itself
 * @param {Map} dataPathMap Map structure containing dataPathObjects values referenced by their label
 * @param {String} key to obtain value in Map
 */
function fetchArgumentVal(dataPathMap, key) {
  return dataPathMap.has(key) ? dataPathMap.get(key) : key;
}

/**
 * validate arguments can be compared and manipulate them to achieve a valida comparison, if possible (e.g., remove values from singleton arrays to compare them, then check the type of both is the same)
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
      break;
    case "in":
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
    case "isSubsetOf":
    case "arr_diff_nonSymm":
      //arg1 must be an array
      //arg2 must be an array
      if (!Array.isArray(firstArg))
        throw new ErrorHandler(
          500,
          `A comparison action with symbol 'isSubsetOf' is expecting an array as arg1 but found : ${JSON.stringify(
            first
          )}.`
        );
      if (!Array.isArray(secondArg))
        throw new ErrorHandler(
          500,
          `A comparison action with symbol 'isSubsetOf' is expecting an array as arg2 but found : ${JSON.stringify(
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
            `A comparison action with symbol ${symbol} has unexpectedly found an Array : ${JSON.stringify(
              firstArg
            )} on arg1.`
          );
      }

      if (Array.isArray(secondArg) && secondArg.length === 1) {
        secondArg = secondArg[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (Array.isArray(secondArg))
          throw new ErrorHandler(
            500,
            `A comparison action with symbol ${symbol} has unexpectedly found an Array : ${JSON.stringify(
              secondArg
            )} on arg2.`
          );
      }

      //comparisons must be done between 2 objects of the same type
      //
      let typeOfArg1 = _typeOf(firstArg);
      let typeOfArg2 = _typeOf(secondArg);
      if (typeOfArg1 !== typeOfArg2) {
        throw new ErrorHandler(
          500,
          `Comparison not applicable: distinct data types are being compared ${firstArg}:${typeOfArg1} and ${secondArg}:${typeOfArg2}.`
        );
      }
      break;
  }

  return { firstArg: firstArg, secondArg: secondArg };
}

/*** Applies user defined functions or actions between data extracted from hook context .
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

    logger.info(`Applied Action is: ${anActionLabel}`);

    //parameter names used as arguments. We expect at most 2 arguments
    //their values can be references to dataPath objects or, for arg2, a primitive value
    let arg1Ref;
    let arg1Val;
    let arg2Ref;

    //test for consistent structure
    if (
      anAction.hasOwnProperty(details) &&
      anAction[details].hasOwnProperty(arg1)
    ) {
      //ref name of first argument
      arg1Ref = anAction[details][arg1];
      //value of first arg
      arg1Val = fetchArgumentVal(dataPathMap, arg1Ref);

      //test for a second argument
      if (anAction[details].hasOwnProperty(arg2))
        arg2Ref = anAction[details][arg2];
    } else {
      throw new ErrorHandler(
        500,
        `field ${details} or ${arg1} is not found in the actions array of the MongoDb document.`
      );
    }

    //this var will contain the resulting value, after function application, to replace the initial arguments
    let newVal;

    ///begin with comparison between arguments. resulting boolean value is stored in first given argument, ie., lhs arg
    //the rhs argument must be nullified so that it does not show in the reply
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
        //check each value is a numeric string
        //convert to array
        if (!Array.isArray(arg1Val)) arg1Val = [arg1Val];
        if (arg1Val.some(isNaN))
          throw new ErrorHandler(
            500,
            "Fetch values from the data path input array are not numeric. Action object is: " +
              JSON.stringify(anAction)
          );
        //no arg2 expected
        //value of arg1 could be an array of codes to apply operator
        try {
          let response = await getSnomedQueryResult(anAction, arg1Val);
          //for each elem in response, apply jsonata
          //check that no errors are in the response from jsonata application
          //flatten array with resulting codes
          let resVals = response.map((context) =>
            getDataFromContext(jsonEclQueryExpr, context)
          );

          newVal = flat(resVals);
        } catch (error) {
          throw new ErrorHandler(500, error.message);
        }

        break;
      ////////
      case findRef:
        //find Resources in context from a list of given references
        //find ref
        newVal = findReferencesInContext(hookCntxtObj, arg1Val, anAction);

        logger.info(
          `FindRef: arg1 reference: ${arg1Ref} has selection ${arg1Val}. Referenced value(s) is ${newVal}.`
        );
        break;
      /////////////
      case comparison:
        //only if 2 args are given
        if (typeof arg2Ref === "undefined" || arg2Ref === null)
          throw new ErrorHandler(
            500,
            `action Comparison not applied: second argument (arg2), either a dataPath reference or a value, is missing.`
          );
        //comparison sign
        let comparisonSymbol = anAction[details][symbol];
        //get arg2 value
        let arg2Val = fetchArgumentVal(dataPathMap, arg2Ref);
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
          case "ne":
            newVal = firstArg !== secondArg;
            //TODO: if ofType Date, lhsArg.getTime() !== rhsArg.getTime()
            break;
          case "in":
            newVal = secondArg.includes(firstArg);
            break;
          case "isSubsetOf":
            newVal = firstArg.every((val) => secondArg.includes(val));
            break;
        }

        logger.info(
          `Comparison: ${arg1Ref} value is ${JSON.stringify(
            firstArg
          )}. ${arg2Ref} value is ${JSON.stringify(
            secondArg
          )}. Comparison symbol is ${comparisonSymbol}. Comparison result is ${newVal}.`
        );
        break;
      ////////////////
      //user-defined functions. to be named here to activate them.
      default: //endOf operatorName Switch
        ///name of user-defined functions. Extend by adding label and how to apply function//
        switch (anActionLabel) {
          case "getYearsFromNow":
            //this case has only one arg so index value has to be at index 0
            newVal = getYearsFromNow(arg1Val);
            break;

          case "calculate_age":
            //this case has only one arg so index value has to be at index 0
            newVal = calculate_age(arg1Val);
            break;

          case "arr_diff_nonSymm":
             //only if 2 args are given
        if (typeof arg2Ref === "undefined" || arg2Ref === null)
        throw new ErrorHandler(
          500,
          `action 'arr_diff_nonSymm' not applied: second argument (arg2), either a dataPath reference or a value, is missing.`
        );
      //get arg2 value
      let arg2Val = fetchArgumentVal(dataPathMap, arg2Ref);
            newVal = arr_diff_nonSymm(arg1Val, arg2Val);
            break;
        }

        logger.info(`Function: function ${anActionLabel} returns ${newVal}.`);
        break;
    } //endOf main Switch

    logger.info(`Datapath with key ${arg1Ref} has value ${newVal}.`);
    //replace argument with resulting value
    dataPathMap.set(arg1Ref, newVal);
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
 * @param {String} datapathArg1 label of first element in dataPaths array
 * @returns {Array} Array of results
 */
async function getOutcome(
  model,
  keyParam,
  datapathMap,
  constraintActions, //constraint satisfaction actions
  constraints,
  datapathArg1
) {
  //SPECIAL CASES

  //check output array is empty
  let isOutputEmpty = constraints.length === 0 || (typeof constraints === "undefined") ;

  //if there are actions to be applied but no outcomes then this is an error
  if (constraintActions.length > 0 && isOutputEmpty) {
    throw new ErrorHandler(
      500,
      `Constraint satisfaction actions cannot be applied to 'constraints' because list is empty or missing parameters. Parameter = ${keyParam}.`
    );
  }

  // If there are no constraint actions to be applied
  //return dataPath values
  if (constraintActions.length === 0) {
    //if there are values in output, this is an error
    if (!isOutputEmpty)
      throw new ErrorHandler(
        500,
        `${keyParam} has no constraint satisfaction actions and a non-empty output field = ${JSON.stringify(
          constraints
        )}. This is not allowed.`
      );
    //return datapath values
    
      return datapathMap.get(datapathArg1);
    
  }

  //now for each specific action:

  //if arg at index i in argsPathList is undefined, got to i + 1 arg
  //undefined here is taken as an optional element where we have no data, so it should not alter the flow.
  //TODO: LHS could also have wildcards to denote any result is Ok. How to handle that?

  let conditionList = new Array();

  //for each action in this parameter
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

    //the label in output
    let arg2Key = aConstraintAction[details][arg2];

    //the key for fetching the lhs argument
    let arg1Key = aConstraintAction[details][arg1];

    //Next, use the lhs index to get the value for the lhs. Note that rhs could have many results to select from
    let arg1_val = fetchArgumentVal(datapathMap, arg1Key);

    //Now we check whether the arguments is undefined, if it is, we implicitly take it as a positive result -we added undefined to hold a position- and skip to next action
    if (arg1_val === undefined) continue;

    //convert arg1 into an array. Then, transform as required by actions.
   // if (!Array.isArray(arg1_val)) arg1_val = [arg1_val];

    //keep track of whether it is a singleton
    //let isSingletonLHSValue = arg1_val.length < 2;

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
    //this is the RHS value (arg2)
    let aConstraintParamElem = "$$resultObject." + queryArgs + "." + arg2Key;

    //object for the comparison
    let compObj; //TODO: comparison between 2 params and then result

    //at this point we have as valueAtPathIndex an array w length > 1 or a primitive value
    switch (actionName) {
      case "is_a":
      case "has_a":
        //dont add results to dataPath but use directly as other subsumptions could use the same values
        //retrieve all values from the constraint object in output for this arg2 key
        let dataPathRefVals = constraints.map(
          (constr) => constr[queryArgs][arg2Key]
        );
        //flatten result and  remove repeated vals
        dataPathRefVals = [...new Set(flat(dataPathRefVals))];

        //check all values are numeric
        if (dataPathRefVals.some(isNaN))
          throw new ErrorHandler(
            500,
            `Some value(s) from arg2 (${dataPathRefVals}) are not numeric when unpacking ${JSON.stringify(
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

        //now we have an array with all the values unique from the constraint object for arg2
        //for each value in array arg1, resolve the subsumption query
        let results = await getSnomedQueryResult(
          aConstraintAction,
          arg1_val,
          dataPathRefVals
        );

        //apply jsonata to results (array of array)
        //for each context in array of arrays, apply jsonata query
        //if 'error:' in response of one getDataFromContext application then error thrown
        results = results.map((arr) => {
          //this array must have same length as constraints array
          if (arr.length !== dataPathRefVals.length)
            throw new ErrorHandler(
              500,
              `constraints array is not the same length as array with results from querying SNOMED browser in action ${JSON.stringify(
                aConstraintAction
              )} where  values are : ${JSON.stringify(
                arr
              )} and : ${JSON.stringify(dataPathRefVals)}.`
            );

          let validCodes = [];

          for (let index = 0; index < arr.length; index++) {
            //boolean value or throws error
            const boolVal = getDataFromContext(jsonIsaExpr, arr[index]);
            //code that originated the boolean value
            const elem = dataPathRefVals[index];
            if (boolVal) validCodes.push(elem);
          }
          //return array w responses
          return validCodes;
        });

        //flatten results and remove duplicates
        results = [...new Set(flat(results))];

        //then use results as part of subsetLhs query
        compObj = { $in: [aConstraintParamElem, results] };
        break;
        ////////////////////////////
      case "eq":
        compObj = { 
          $eq: [arg1_val, aConstraintParamElem],
        };
        break;
      case "gte":
        if(Array.isArray(arg1_val) && arg1_val.length === 1)  arg1_val = arg1_val[0];
        compObj = {
          $gte: [arg1_val, aConstraintParamElem],
        };
        break;
      case "gt":
        if(Array.isArray(arg1_val) && arg1_val.length === 1)  arg1_val = arg1_val[0];
        compObj = {
          $gt: [arg1_val, aConstraintParamElem],
        };
        break;
      case "lte":
        if(Array.isArray(arg1_val) && arg1_val.length === 1)  arg1_val = arg1_val[0];
        compObj = {
          $lte: [arg1_val, aConstraintParamElem],
        };
        break;
      case "lt":
        if(Array.isArray(arg1_val) && arg1_val.length === 1)  arg1_val = arg1_val[0];
        compObj = {
          $lt: [arg1_val, aConstraintParamElem],
        };
        break;
      case "in":
         if(Array.isArray(arg1_val) && arg1_val.length === 1)  arg1_val = arg1_val[0];
          compObj = { $in: [arg1_val, aConstraintParamElem] };
        break;
      case "inLhs":
        if(!Array.isArray(arg1_val))  arg1_val = [arg1_val];
          compObj = { $in: [aConstraintParamElem, arg1_val] };
        break;
      case "isSubsetOfLhs":
        if(!Array.isArray(arg1_val))  arg1_val = new Array(arg1_val);
        compObj = { $setIsSubset: [aConstraintParamElem, arg1_val] };
        break;
      case "isSubsetOf":
        if(!Array.isArray(arg1_val))  arg1_val = new Array(arg1_val);
        compObj = { $setIsSubset: [arg1_val, aConstraintParamElem] };
        break;
    } //endOf switch
    
    //add elemMatch to object
    conditionList.push(compObj);
    //logger.info("Condition is " + JSON.stringify(compObj));
  } //end of loop

  let conditionObj =
    conditionList.length > 1 ? { $and: conditionList } : conditionList[0];

  //logger.info("ConditionList sent to DB is " + JSON.stringify(conditionObj));

  let mergedResults;

  //query databse
  try {
    let resultArr = await model.aggregate([
      { $match: { [paramName]: keyParam } },
      {
        $project: {
          matchedItems: {
            $filter: {
              input: "$" + outputArray,
              as: "resultObject",
              cond: conditionObj,
            },
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          results: {
            $addToSet: `$matchedItems.` + outcome,
          },
        },
      },
    ]);

    //flatten outcome 2 layers down max items in result
    //TODO: test 2 layers of flattening doesnt affect results that are lists where more than one outcome was satisfied
    logger.info(`result Array is ${JSON.stringify(resultArr)}`);
    mergedResults = flat(resultArr[0].results[0], 2);
  } catch (error) {
    logger.error(
      `object ${keyParam} failed  to convert results using the DB:  ${error}`
    );
    throw error;
  }

  logger.info(`mergedResults Array is ${JSON.stringify(mergedResults)}`);
  //add to Map
  return mergedResults;
}

export {
  getDataPointValues,
  getOutcome,
  applyActions,
  addFunctionsFromTemplateToArgsObject,
  callCdsServicesManager,
};
