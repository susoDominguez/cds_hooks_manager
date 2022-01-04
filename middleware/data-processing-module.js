"use strict";

const jsonata = require("jsonata");
const {
  paramName,
  functLabel,
  argList,
  queryArgs,
  outcome,
  details,
  Qomparison,
  outcomeList,
  typePath,
  action,
  pathList,
  isMandatory,
  xpath,
  comparison,
  defaultVal,
  findRef,
  labelTemplate,
  isAncestor_eq,
  codeSyst,
  actionList,
  symbol,
  arg1,
  arg2,
} = require("../database_modules/constants.js");
const flat = require("array.prototype.flat");
const {
  arr_diff_nonSymm,
  calculate_age,
  getYearsFromNow,
} = require("../lib/user-defined-functions");
const { ErrorHandler } = require("../lib/errorHandler");
const logger = require("../config/winston");
const { Model } = require("mongoose");
const got = require("got");
const axios = require("axios");
const qs = require("querystring");
const {
  SNOMEDCT,
  CDS_SERVICES_MS_HOST,
  CDS_SERVICES_MS_PORT,
  CDS_SERVICES_MS_PATH,
} = process.env;
//cds services manager url
//not using SSL yet
const url_CdsServices = `http://${CDS_SERVICES_MS_HOST}:${CDS_SERVICES_MS_PORT}/${CDS_SERVICES_MS_PATH}/`;
///////////////////////////////////////////////////////
/**
 *
 * @param {string} hookId
 * @param {string} cigId
 * @param {Map} data
 * @returns response from cds services manager microservice
 */
async function callCdsServicesManager(hookId, cigId, reqData) {
  const cigModel = hookId + (cigId ? `/cigModel/${cigId}` : ``);
  //construct URL
  const baseURL = url_CdsServices + cigModel;

  //create config
  let config = {
    method: "post",
    url: baseURL,
    headers: {
      "Content-Type": "application/json",
    },
    data: reqData,
  };
  try {
    const response = await axios(config);
    if (response.status >= 400 )
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
 * creates an object containing values and actions to be applied to values
 * @param {object} eform context as taken from request call
 * @returns {object} object containig values and functions to be applied to those values
 */
function addFunctionsFromTemplateToArgsObject(eform) {
  //get actions
  let actionArray = eform[actionList];

  //check we are working w/array
  if (!Array.isArray(actionArray))
    throw new ErrorHandler(
      500,
      actionList + " object from MongonDB is not an array as expected"
    );

  /// HANDLE ACTIONS ///

  //filter actions: function (goes first), comparison(second) and arra_eq (goes last)
  //object to be returned as output of this function
  let argVals = {
    funListAction: actionArray.filter(
      (obj) =>
        obj[action] === functLabel ||
        obj[action] === findRef ||
        obj[action] === isAncestor_eq ||
        obj[action] === comparison
    ),
    //filter only comparisons with the outcomeList; they have at most one argument form argList
    actions: actionArray.filter(
      (obj) =>
        //not equal to any of the above elements apart from isAncestor_eq
        obj[action] !== functLabel &&
        obj[action] !== findRef &&
        //obj[action] !== isAncestor_eq &&
        obj[action] !== comparison
    ),
    //Map of arguments where the key is the parameter label and the value is the PathList object.
    //To be extracted from clinical context as part of request
    argsPathListMap: new Map(),
    //list of assessed results. to be compared with arguments to select zero or more results if triggered.
    argsOutcomeList: eform[outcomeList],
  };

  //check they are arrays
  if (
    !Array.isArray(argVals["funListAction"]) ||
    !Array.isArray(argVals["actions"])
  )
    throw new ErrorHandler(
      500,
      "actionLists have not been created dynamically as expected"
    );

  return argVals;
}

/**
 * add parameter and derived value from e-forms to a Map
 * @param {object} contextObj context as taken from request
 * @param {object} docObj e-form object
 * @param {Map} argsPathListMap Map from eform objects to returned values
 */
function getDataPointValues(contextObj, docObj, argsPathListMap) {
  //Fetch parameters, type properly and add to MAP.
  //Then apply to already existing MAP object the actions for comparisons to find results
  //or the existing result if not comparison is needed

  //Array containing list of objects with data points to be extracted:
  const pathListObj = docObj[pathList];

  //recognise as array
  if (!Array.isArray(pathListObj))
    throw new ErrorHandler(500, "field paths expected to be an array.");

  //for each path in pathList. If path is empty list, deal with it later
  for (const aPath of pathListObj) {
    //check it has all the expected properties
    if (
      !(
        aPath.hasOwnProperty(typePath) ||
        aPath.hasOwnProperty(isMandatory) ||
        aPath.hasOwnProperty(xpath) ||
        aPath.hasOwnProperty(labelTemplate) ||
        aPath.hasOwnProperty(defaultVal)
      )
    )
      throw new ErrorHandler(
        500,
        `MongoDB: Parameter ${
          docObj[paramName]
        } is missing a required attribute in Property ${pathList}. ${
          aPath.hasOwnProperty(labelTemplate)
            ? " Label value is " + aPath[labelTemplate]
            : ""
        }`
      );

    //label of e-form
    let eformLabel = aPath[labelTemplate];
    //type of path
    let dataType = aPath[typePath];
    //is this data optional?
    let isDataOptional = !aPath[isMandatory];

    //string with the Jpath to value and the default value
    let jpathStr = aPath[xpath];

    //obtain value from request body. If not found, JSONATA returns undefined.
    //Also could be undefined on purpose to add user-defined values in default.
    let valueFromContext =
      jpathStr && jpathStr.trim() !== ""
        ? getDataFromContext(jpathStr, contextObj)
        : undefined;

    //if undefined, get the default value which could also be undefined or a JSONpath of the same type as the main one
    if (valueFromContext === undefined) {
      //get default value (possibly undefined or "-1") and check whether it is also a path to data in a resource
      let defaultValue = aPath[defaultVal];

      // is it an array? convert into a JSON array
      if (("" + defaultValue).trim().startsWith("["))
        defaultValue = JSON.parse(defaultValue);

      //are we dealing with another JSONPath format?
      //TODO: Possibly add another property to confirm it is a JPath
      let isDefaultValueJpath =
        defaultValue !== undefined &&
        !Array.isArray(defaultValue) &&
        //cds Hooks informational context
        (("" + defaultValue).startsWith("context") ||
          ("" + defaultValue).startsWith("prefetch"));

      //if default is a path, apply Jsonpath otherwise return the value
      valueFromContext = isDefaultValueJpath
        ? getDataFromContext(defaultValue, contextObj)
        : defaultValue;
    } //endOf default vlaue undefined

    //if this parameter is still undefined :
    if (valueFromContext === undefined) {
      //but optional:
      if (isDataOptional) {
        //return undefined to hold the position in the array of arguments
        argsPathListMap.set(eformLabel, undefined);
        //then continue to next iteration
        continue;
      } else {
        //if mandatory, end process and send error
        throw new ErrorHandler(
          500,
          `MongoDB: In parameter ${docObj[paramName]}, data Object ${eformLabel} is required yet its value could not be extracted from the request neither a default value is specified in the template.`
        );
      }
    }

    logger.info(
      `dataPath ${eformLabel} returned value ${JSON.stringify(
        valueFromContext
      )}`
    );

    /// DATA HAS ALREADY BEEN EXTRACTED ///

    //typing the extracted data
    valueFromContext = typePathVal(dataType, valueFromContext);

    //add value to list after potentially applying a function on it.
    argsPathListMap.set(eformLabel, valueFromContext);
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
  return expression.evaluate(contextObj);
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
        resultArr[iters - 1] = new Date(tempVal);
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
 * Find ancestors of given concept using the given clinical code schema
 * @param {String} schemeId clinical code scheme id
 * @param {String} concept concept id
 */
async function getAncestors(schemeId, concept) {
  //find URL from schemeId
  let postUrl = "";
  let preUrl = "https://";
  let jsonPath = "";

  switch (schemeId) {
    default:
      postUrl =
        SNOMEDCT +
        "/snowstorm/snomed-ct/browser/MAIN/concepts/" +
        concept +
        "/ancestors";
      jsonPath = `$.conceptId`;
      break;
  }
  try {
    let res = await got(preUrl + postUrl, { json: true });
    return getDataFromContext(jsonPath, res.body);
  } catch (err) {
    throw new ErrorHandler(500, err);
  }
}

/**
 *
 * @param {object} hookContext hook Context
 * @param {Map} refsList list of references
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
  let typing = actObj[details][typePath];

  //list of results that will replace the list of arguments at the given index of the general argsList array
  let tempList = new Array();

  //for each reference
  for (const refString of refsList) {
    //replace var1 and var2 by refString parts
    let refWords = refString.split("/");

    //find value in Path.
    //replace placeholders by FHIR ResourceType and FHIR Id
    let pathStr = xPathStr
      .replace("var1", refWords[0])
      .replace("var2", refWords[1]);
    logger.info(`path string is ${pathStr}`);
    let res = getDataFromContext(pathStr, hookContext);

    if (!res)
      throw new ErrorHandler(
        500,
        `Function reference finder has not been able to find the reference in the context using the specified data from MOngoDB`
      );
    //add to temp list
    tempList.push(res);
  }
  //flatten list with referenced values
  tempList = flat(tempList, 1);

  //typing of values
  //replace args with new data list
  return typePathVal(typing, tempList);
}

/**
 * Using a given object, fetch value in MAp using object as key, else object is value itself
 * @param {Map} dataPathMap Map structure containing dataPaths values referenced by their label
 * @param {object} param Object that can be a key to obtain value or value directly
 */
function fetchArgumentVal(dataPathMap, param) {
  return dataPathMap.has(param) ? dataPathMap.get(param) : param;
}

/*** Applies user defined functions or actions between data extracted from hook context or subClassOf operator.
 * Order of application matters. Note that findRef > user-defined functs > comparison > isAncestor_eq between hook data as arguments
 * @param {object} hookCntxtObj hook context with resources. To be used on a reference find
 * @param {object} outputObj output list. To be applied to isAncestor_eq
 * @param {array} funListAction array with functions
 * @param {Map} dataPathsValMap map with data extracted from hook context referenced by dataPaths' parameter field
 */
async function applyActions(
  hookCntxtObj,
  outputObj,
  funListAction,
  dataPathsValMap
) {
  //if empty, there are no actions to be applied at this moment
  if (funListAction == []) return;

  //apply mid-process action to values in list of arguments
  for (const actionObject of funListAction) {
    //name of function
    let operatorName;
    //check for properties action and details
    if (
      actionObject.hasOwnProperty(action) &&
      actionObject.hasOwnProperty(details)
    ) {
      //if it is labelled as function, take the function symbol as operator otherwise use the action name
      operatorName =
        actionObject[action] === functLabel
          ? actionObject[details][symbol]
          : actionObject[action];
    } else {
      throw new ErrorHandler(
        500,
        `property ${action} or ${details} are not found in object ActionList on template`
      );
    }

    //parameter names used as arguments. We expect at most 2 arguments
    let firstArgLbl;
    let secondArgLbl;

    //test for consistent structure
    if (
      actionObject.hasOwnProperty(details) &&
      actionObject[details].hasOwnProperty(arg1)
    ) {
      //name of first argument
      firstArgLbl = actionObject[details][arg1];

      //test for a second argument
      if (actionObject[details].hasOwnProperty(arg2))
        secondArgLbl = actionObject[details][arg2];
    } else {
      throw new ErrorHandler(
        500,
        `field ${details} or ${arg1} is not found in e-form`
      );
    }

    //this var will contain the resulting value to replace the initial arguments
    let newVal;

    ///begin with comparison between arguments. resulting boolean value is stored in first given argument, ie., lhs arg
    //the rhs argument must be nullified so that it does not show in the reply
    //then user-defined functions
    switch (operatorName) {
      case isAncestor_eq:
        //fetch all conceptId values from outcomeList:
        //field name on rhs and code system id
        let codeSystId;

        if (
          //test there is a field for code system and that we have a second parameter
          actionObject[details].hasOwnProperty(codeSyst) &&
          secondArgLbl
        ) {
          codeSystId = actionObject[details][codeSyst];
        } else {
          throw new ErrorHandler(
            500,
            `property codeSystmId or arg2 are not found in action subClassOf`
          );
        }

        //obtain all concept Ids using arg2 and output
        //path to values using index
        let jsonPathArg2 = `$.queryArgs.${secondArgLbl}`;
        //find values.
        //Returns an array.
        let args2Values = getDataFromContext(jsonPathArg2, outputObj);

        //apply operation for each extracted concept and list of concepts extracted
        //from hook context
        //if succeeds, add concept Id to a list
        //when done, conceptIdList is the value to add to arg1 val
        //Obtain conceptId from  from outcomeList using jsonata
        //for each conceptId, apply isAncestor_eq
        let args1Values = dataPathsValMap.get(firstArgLbl);

        //isAncestor_eq expects a list of conceptIds to check
        //link lists or add item to list
        let conceptIdList = new Array();
        if (Array.isArray(args1Values)) {
          conceptIdList = args1Values;
        } else {
          conceptIdList.push(args1Values);
        }

        //retrieve a list of all ancestors for all concepts
        let allAncestors = await Promise.all(
          conceptIdList.map(async (conceptId) => {
            //logger.info(`conceptId is ${conceptId}`);
            return getAncestors(codeSystId, conceptId);
          })
        );
        //add the concepts also
        allAncestors.push(conceptIdList);
        //flatten
        allAncestors = flat(allAncestors, 1);

        newVal = new Array();

        logger.info(`allAncestors is ${JSON.stringify(allAncestors)}`);

        for (let index = 0; index < args2Values.length; index++) {
          let conceptId = args2Values[index];
          logger.info(`parent conceptId is ${conceptId}`);
          logger.info(`is ancestor ${allAncestors.includes(conceptId)}`);
          if (allAncestors.includes(conceptId)) newVal.push(conceptId);
        }

        logger.info(
          `isSubClass: arg1 has values ${JSON.stringify(
            args1Values
          )}. arg2 has values ${JSON.stringify(
            args2Values
          )}. Matched ancestors are ${JSON.stringify(newVal)}`
        );

        //TODO: when evaluating, check whether any ancestorConceptid is in the list of arguments
        break;
      //////////////////
      case findRef:
        //find Resources in context from a list of given references
        newVal = findReferencesInContext(
          hookCntxtObj,
          dataPathsValMap.get(firstArgLbl),
          actionObject
        );
        logger.info(
          `FindRef: ${firstArgLbl} has selection ${dataPathsValMap.get(
            firstArgLbl
          )}. Referenced values are ${newVal}`
        );
        break;
      /////////////
      case comparison:
        //only if 2 args are given
        if (!secondArgLbl)
          throw new ErrorHandler(
            500,
            `second argument is missing when comparing objects`
          );

        //comparison sign
        const comparisonSymbol = actionObject[details][symbol];

        //find whether argument is a key or a value to be applied directly
        //if key, get value from Map
        let lhsArg = fetchArgumentVal(dataPathsValMap, firstArgLbl);
        let rhsArg = fetchArgumentVal(dataPathsValMap, secondArgLbl);

        //To compare 2 values taken from the pathList,
        //we expect at most one singleton array or a primitive value; otherwise it is an error
        //if singleton array, fetch value else error
        if (Array.isArray(lhsArg) && lhsArg.length < 2) {
          lhsArg = lhsArg[0];
        } else {
          //if it is an array then it must have size greater than 2
          if (Array.isArray(lhsArg))
            throw handleError(
              500,
              `A comparison action from template DB has unexpectedly found more than 1 argument: ${JSON.stringify(
                lhsArg
              )} on its LHS parameter (array). Check Request body or JSONpath`
            );
        }
        if (Array.isArray(rhsArg) && rhsArg.length < 2) {
          rhsArg = rhsArg[0];
        } else {
          //if it is an array then it must have size greater than 2
          if (Array.isArray(rhsArg))
            throw new ErrorHandler(
              500,
              `A comparison action from template DB has unexpectedly found more than 1 argument: ${JSON.stringify(
                rhsArg
              )} on its LHS parameter (array). Check Request body or JSONpath`
            );
        }
        //compare with respect to symbol
        switch (comparisonSymbol) {
          case "eq":
            newVal = lhsArg === rhsArg;
            //TODO: if ofType Date, lhsArg.getTime() === rhsArg.getTime()
            break;
          case "lt":
            newVal = lhsArg < rhsArg;
            break;
          case "lte":
            newVal = lhsArg <= rhsArg;
            break;
          case "gt":
            newVal = lhsArg > rhsArg;
            break;
          case "gte":
            newVal = lhsArg >= rhsArg;
            break;
          case "ne":
            newVal = lhsArg !== rhsArg;
            //TODO: if ofType Date, lhsArg.getTime() !== rhsArg.getTime()
            break;
          // TODO: case "in":
          // newVal = (Array.isArray(lhsArg)) ?
        }
        logger.info(
          `Comparison: ${firstArgLbl} value is ${lhsArg}. ${secondArgLbl} value is ${rhsArg}. symbol is ${comparisonSymbol}. Comparison result is ${newVal}.`
        );
        break;
      ////////////////
      //user-defined functions. to be named here to activate them.
      default:
        ///name of user-defined functions. Extend by adding label and how to apply function//
        switch (operatorName) {
          case "getYearsFromNow":
            //this case has only one arg so index value has to be at index 0
            newVal = getYearsFromNow(dataPathsValMap.get(firstArgLbl));
            break;

          case "calculate_age":
            //this case has only one arg so index value has to be at index 0
            newVal = calculate_age(dataPathsValMap.get(firstArgLbl));
            break;

          case "arr_diff_nonSymm":
            //make sure they are both arrays
            let arr1 = new Array();
            let arr2 = new Array();

            if (!Array.isArray(dataPathsValMap.get(firstArgLbl))) {
              arr1.push(dataPathsValMap.get(firstArgLbl));
            } else {
              arr1 = dataPathsValMap.get(firstArgLbl);
            }

            if (!Array.isArray(dataPathsValMap.get(secondArgLbl))) {
              arr2.push(dataPathsValMap.get(secondArgLbl));
            } else {
              arr2 = dataPathsValMap.get(secondArgLbl);
            }

            newVal = arr_diff_nonSymm(arr1, arr2);
            break;
        } //endOf operatorName Switch
        logger.info(`Function: function ${operatorName} returns ${newVal}.`);
        break;
    } //endOf main Switch

    //replace argument with resulting value
    dataPathsValMap.set(firstArgLbl, newVal);
  } //endOfLoop

  //arguments are arrays so pass-by-ref, hence no need to return changes
}

/**
 * @param {Model} model model of db schema
 * @param {string} keyParam parameter label
 * @param {object} actionsObj object containing actions and arguments
 * @returns {Array} a (possibly flattened) array with results
 */
async function getOutcomeList(
  model,
  keyParam,
  {
    funListAction = [],
    actions = [],
    argsPathListMap = [],
    argsOutcomeList = [],
  }
) {
  //SPECIAL CASES
  logger.info(`keyParam in getOutcomeList is ${keyParam}`);

  //if argsoutcomeList is empty,
  //then the purpose is to return the fetched (and possibly modified by user-defined functs)
  //value(s) from the hook context.
  if (argsOutcomeList.length === 0 || actions.length === 0) {
    let resArr = new Array();
    //remove any undefined value from the argsPathList array before returning
    argsPathListMap.forEach((value, key, map) => {
      if (value !== undefined) resArr.push(value);
    });
    // flatten array into a single array
    return flat(resArr, 1);
  }

  //Case where no data required to be extracted but there is some constant value that must be added for this router, regardless.
  //Then return outcome values from argsLhsList at index 0, as there is no reason to have more items in the array
  if (argsPathListMap.size === 0) {
    return argsOutcomeList[0][outcome];
  }

  //now for each specific action:

  //if arg at index i in argsPathList is undefined, got to i + 1 arg
  //undefined here is taken as an optional element where we have no data, so it should not alter the flow.
  //TODO: LHS could also have wildcards to denote any result is Ok. How to handle that?

  let conditionList = new Array();

  //for each action in this parameter
  for (const actionObj of actions) {
    //fetch lhs (arg1) and rhs (arg2) values as args.
    //Currently, we operate with 2 arguments, one from the output object to be compared with
    //and another from the possibly modified data path value(s). This is an array and it may contain more than
    //one argument. If so, it means a comparison between arguments was already done and the result has been
    //stored in argument at index 0

    //check  properties exist within the action object
    if (
      !(
        actionObj.hasOwnProperty(details) ||
        actionObj[details].hasOwnProperty(arg1) ||
        actionObj[details].hasOwnProperty(arg2)
      )
    )
      throw new ErrorHandler(
        500,
        `Expected properties are missing from the actionList on the DB template for outcome related operations`
      );

    //fetch their indices first:

    //the label in output
    let outputPropLbl = actionObj[details][arg2];

    //the key for fetching the lhs argument
    let lhsArgKey = actionObj[details][arg1];

    //Next, use the lhs index to get the value for the lhs. Note that rhs could have many results to select from
    let aLHSVal = argsPathListMap.get(lhsArgKey);

    //Now we check whether the arguments is undefined, if it is, we implicitly take it as a positive result -we added undefined to hold a position- and skip to next action
    if (aLHSVal === undefined) continue;

    //convert arg1 into an array. Then, transform as required by actions.
    if (!Array.isArray(aLHSVal)) aLHSVal = [aLHSVal];

    //keep track of whether it is a singleton
    let isSingletonLHSValue = aLHSVal.length < 2 ? true : false;

    //get the name of the operation
    let actionName = actionObj[action];

    //If name of the operation is comparison, replace by the comparison operation sign
    if (actionName === Qomparison) {
      //replace with given comparison sign
      actionName = actionObj[details][symbol];
    }

    ///now construct the query//

    //projection field
    //this is the RHS value
    //by default they are wrapped in a List
    let arrElemAtOutput = "$$resultObject." + queryArgs + "." + outputPropLbl;

    //object for the comparison
    let compObj; //TODO: comparison between 2 params and then result

    //at this point we have as valueAtPathIndex an array w length > 1 or a primitive value
    switch (actionName) {
      case "eq":
        compObj = {
          $eq: [aLHSVal, arrElemAtOutput],
        };
        break;
      case "gte":
        compObj = {
          $gte: [aLHSVal, arrElemAtOutput],
        };
        break;
      case "gt":
        compObj = {
          $gt: [aLHSVal, arrElemAtOutput],
        };
        break;
      case "lte":
        compObj = {
          $lte: [aLHSVal, arrElemAtOutput],
        };
        break;
      case "lt":
        compObj = {
          $lt: [aLHSVal, arrElemAtOutput],
        };
        break;
      case "in": //RHS is the outcomeList
        //element in output.queryArgs.[arg2] is an array by default. Test it has more than one arg
        //2 cases:
        //case 1: LHS is not an array
        if (isSingletonLHSValue) {
          compObj = { $in: [aLHSVal[0], arrElemAtOutput] };
        } else {
          //case 2: LHS is an array of size > 1
          // find whether the LHS array is a subset of the RHS array
          compObj = { $setIsSubset: [aLHSVal, arrElemAtOutput] };
        }
        break;
      case "inLhs":
      case isAncestor_eq:
      case "subSetOfLhs":
        compObj = { $setIsSubset: [arrElemAtOutput, aLHSVal] };
        break;
      case "subSetOf":
        compObj = { $setIsSubset: [aLHSVal, arrElemAtOutput] };
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
              input: "$" + outcomeList,
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

module.exports = {
  getDataPointValues,
  getOutcomeList,
  applyActions,
  addFunctionsFromTemplateToArgsObject,
  callCdsServicesManager,
};
