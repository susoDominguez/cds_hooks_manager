"use strict";
const arrayUnion = require('arr-union');
const jsonata = require("jsonata");
const axios = require("axios");
const {
  paramName,
  functLabel,
  argList,
  outcome,
  details,
  resultArgListIndex,
  resultList,
  typePath,
  actionList,
  action,
  pathListIndex,
  pathList,
  isMandatory,
  xpath,
  comparison,
  defaultVal,
  compare,
  findRef,
  functName,
  labelTemplate,
  isAncestor_eq,
  codeSyst,
} = require("../database_modules/constants.js");
const flat = require("array.prototype.flat");
const {
  arr_diff_nonSymm,
  calculate_age,
  getYearsFromNow,
} = require("./user-defined-functions");
const { ErrorHandler } = require("../lib/errorHandler");
const logger = require("../config/winston");
const { Model } = require("mongoose");
const { SNOMEDCT } = process.env;

///////////////////////////////////////////////////////

//this array contains strings corresponding to concepts relationships used as functions
const conceptRelationshipsArr = [isAncestor_eq];

/**
 * Function to check whether a concept is derived from another
 * @param {string} relationType type of relationship to search between main and possibly derived concepts
 * @param {any} conceptId concept ID or list of Ids to match or relate
 * @returns {Promise[]} list of Promises
 */
  async function findAncestors(
  terminology,
  conceptIdList
) {
  let output;

  //terminology is fixed to snomed CT for now
  if (terminology === "SCT") {
    output =  await axios.all( conceptIdList.map( conceptId => axios.get("https://" + SNOMEDCT + conceptId + "ancestors") ) );
  }
  //combine arrays of objects
  let temp = output.map( arr => {
    //return conceptId from each obj in sub array
    arr.map( obj => obj.conceptId)
  });
  //add list of conceptIds to output as there could be a match. Add it to the front of array to avoid searching in ancestors for equality case
  temp.unshift(conceptIdList);
  //combine arrays and remove duplicates
  output = arrayUnion(temp);

  return  output;
}

/**
 * add parameter and corresponding args to Map
 * @param {object} contextObj context as taken from request
 *
 */
function addFunctionsFromTemplateToArgsObject(docObj) {
  //get actions
  let actionArray = docObj[actionList];

  //check we are working w array
  if (!Array.isArray(actionArray))
    throw new ErrorHandler(
      500,
      actionList + " object from MongonDB is not an array as expected"
    );

  /// HANDLE ACTIONS ///

  //filter actions: function and findConceptRelationships (goes first), comparison(second) and arra_eq (goes last)
  //object to be returned as output of this function
  let argVals = {
    funListAction: actionArray.filter(
      (obj) =>
        obj[action] === functLabel ||
        obj[action] === findRef ||
        conceptRelationshipsArr.includes(obj[action]) ||
        (obj[action] === comparison && obj[details][pathListIndex].length > 1)
    ),
    //filter only comparisons with the resultList; they have at most one argument form argList
    //findAncestors is also added as it requires comparison with results
    actions: actionArray.filter(
      (obj) =>
        //not equal to any of the above elements
        obj[action] !== functLabel &&
        obj[action] !== findRef &&
        obj[action] !== comparison &&
        //or if it is a comparison, it has more than one argument
        obj[action] === comparison &&
        obj[details][pathListIndex].length < 2
    ),
    //list of arguments. To be extracted from clinical context as part of request
    argsPathList: new Array(),
    //list of assessed results. to be compared with arguments to select zero or more results if triggered.
    argsResultList: docObj[resultList],
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
 * add parameter and corresponding args to Map
 * @param {object} contextObj context as taken from request
 * @param {object} docObj fetch template
 * @param {object} argsPathList object containing arrays with functions, arguments and assessed results
 */
function getDataPointValues(contextObj, docObj, argsPathList) {
  //three stages: path, actions-functions and action-results.
  //First fetch parameters, type properly, apply functions and add to MAP.
  //THen apply to already existing MAP object the actions for comparisons to find results
  //or the existing result if not comparison is needed

  //Array containing list of objects with data points to be extracted:
  const pathObj = docObj[pathList];

  //by checking if type array, it types pathObj
  if (!Array.isArray(pathObj))
    throw new ErrorHandler(500, "field paths expected to be an array.");

  //for each path in pathList. If path is empty list, deal with it later
  for (const aPath of pathObj) {
    //check it has all the expected properties
    if (
      !(
        aPath.hasOwnProperty(typePath) ||
        aPath.hasOwnProperty(isMandatory) ||
        aPath.hasOwnProperty(xpath) ||
        aPath.hasOwnProperty(labelTemplate)
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

    //label of data
    let dataLabel = aPath[labelTemplate];
    //type of path
    let dataType = aPath[typePath];

    //is this data optional?
    let isDataOptional = !aPath[isMandatory];

    //string with the xpath to value and the default value
    let jpathStr = aPath[xpath];

    //obtain value from request body. If not found, it returns undefined.
    //Also could be undefined on purpose to add user-defined values in default.
    let valueFromContext =
      jpathStr && jpathStr.trim() !== ""
        ? getDataFromContext(jpathStr, contextObj)
        : undefined;

    //get default value (possibly undefined) and check whether it is also a path to data in a resource
    let defaultValue = aPath[defaultVal];

    // is it an array?
    if (("" + defaultValue).trim().startsWith("["))
      defaultValue = JSON.parse(defaultValue);

    //are we dealing with another JSONPath format? //TODO: Possibly add another property to confirm it is a JPath
    let isDefaultValueJpath =
      defaultValue !== undefined &&
      !Array.isArray(defaultValue) &&
      (("" + defaultValue).startsWith("context") ||
        ("" + defaultValue).startsWith("prefetch"));

    //if undefined, get the default value which could also be undefined or a JSONpath of the same type as the main one
    if (valueFromContext === undefined) {
      //if default is a path, apply Jsonpath otherwise return the value
      valueFromContext = isDefaultValueJpath
        ? getDataFromContext(defaultValue, contextObj)
        : defaultValue;
    }

    //if this parameter is still undefined :
    if (valueFromContext === undefined) {
      //but optional:
      if (isDataOptional) {
        //return undefined to hold the position in the array of arguments
        argsPathList.push(undefined);
        //then continue to next iteration
        continue;
      } else {
        //if mandatory, end process and send error
        throw new ErrorHandler(
          500,
          `MongoDB: In parameter ${docObj[paramName]}, data Object ${dataLabel} is required yet its value could not be extracted from the request neither a default value is specified in the template.`
        );
      }
    }

    logger.info(
      `Extracted context value for property ${dataLabel} in MOngoDb is:  ${JSON.stringify(
        valueFromContext
      )}`
    );

    /// VALUE IS ALREADY EXTRACTED ///

    //typing the extracted data
    valueFromContext = typePathVal(dataType, valueFromContext);

    //add value to list after potentially applying a function on it. Remove from arra wrapping if required
    argsPathList.push(valueFromContext);
  }

  //return object with actions and arguments
  //return argVals;
}

/**
 *
 * @param {string} jsonpath path to values
 * @param {object} contextObj hook context
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
 *
 * @param {object} hookObj context as taken from request object
 * @param {object} actObj object findRef action definition from Fetch Template
 * @returns array
 */
function findReferencesInContext(hookObj, listOfArgs, actObj, indexArr) {
  //check for properties
  if (
    !(
      actObj.hasOwnProperty(details) ||
      actObj[details].hasOwnProperty(xpath) ||
      actObj[details].hasOwnProperty(typePath)
    )
  )
    throw handleError(
      500,
      `property ${details} is missing  property ${Jpath} or ${typePath} in object ActionList on template`
    );

  //xpath is expected to be written with 2 placeholders: var1 and var2
  let xPathStr = actObj[details][xpath] || undefined;
  let typing = actObj[details][typePath] || undefined;

  //get reference(s) from array with arguments
  let refArr = listOfArgs[indexArr[0]];

  //list of results that will replace the list of arguments at the given index of the general argsList array
  let tempList = new Array();

  //for each reference
  for (const refString of refArr) {
    //replace var1 and var2 by refString parts
    let refWords = refString.split("/");

    //find value in Path.
    //replace placeholders by FHIR ResourceType and FHIR Id
    let pathStr = xPathStr
      .replace("var1", refWords[0])
      .replace("var2", refWords[1]);
    logger.info(`path string is ${pathStr}`);
    let temp = getDataFromContext(pathStr, hookObj);

    if (!temp)
      throw new ErrorHandler(
        500,
        `Function reference finder has not been able to find the reference in the context using the specified data from MOngoDB`
      );
    //add to temp list
    tempList.push(temp);
  }
  //typing of values
  //replace args with new data list
  return typePathVal(typing, tempList);
}

/*** Applies user defined functions or actions where all the arguments come from the CDS Hook.
 * Order of application matters. Note that findRef > user-defined functs > comparison > concept relations between hook data as arguments
 * @param {object} hookObj hook context with resources. To be used on a reference find
 * @param {array} funListAction array with functions
 * @param {array} listOfArgs array with  arguments
 */
async function applyActions(hookObj, funListAction, listOfArgs) {
  //if empty, there are no middle actions to be applied at this moment
  if (funListAction == []) return;

  ///

  //apply mid-process action to values in list of arguments
  for (const actObj of funListAction) {
    //name of function
    let funName;

    //update var with name of function
    if (actObj.hasOwnProperty(action) && actObj.hasOwnProperty(details)) {
      //if it is labelled as function, use the function name given in details property
      funName =
        actObj[action] === functLabel
          ? actObj[details][functName]
          : actObj[action];
    } else {
      throw new ErrorHandler(
        500,
        `property ${action} or ${details} are not found in object ActionList on template`
      );
    }

    //list with indices for arguments. We expect at most 2 arguments
    let indexArr;
    if (
      actObj.hasOwnProperty(details) &&
      actObj[details].hasOwnProperty(pathListIndex)
    ) {
      indexArr = actObj[details][pathListIndex];
    } else {
      throw new ErrorHandler(
        500,
        `property ${details} or ${pathListIndex} are not found in object ActionList on template`
      );
    }

    //if anything fails, throw error
    if (!Array.isArray(indexArr))
      throw new ErrorHandler(
        500,
        `MongoDb error: actionList has issues with a function on the MongoDb. Check details of function ${funName}.`
      );

    ///
    //argument on the LHS
    let lhsArg = listOfArgs[indexArr[0]];
    ///
    //this var will contain the resulting value to replace the initial arguments
    let newVal;
    ///

    ///begin with relationships and next comparison between arguments. resulting boolean value is stored in first given argument, ie., lhs arg
    //the rhs argument must be nullified so that it does not show in the reply
    //then user-defined functions

    if (conceptRelationshipsArr.includes(funName)) {
      //check a terminology has been added to the input in the data document
      if (!actObj[details].hasOwnProperty(codeSyst))
        return new ErrorHandler(
          500,
          "property codeSystem is missing in data document with action " +
            funName
        );
        //code system -fixed to SCT at the moment-
        let terminology = actObj[details][codeSyst];     
         //if it is not an array, create it as such.
         let conceptIdList = !Array.isArray(lhsArg)? new Array(lhsArg): lhsArg; 
        //returns a list of Promises. //TODO: await here or right before using it in the last step?
        //concat args with results as well as combining results intoone single array with no reps
        newVal = await findAncestors(terminology, conceptIdList);
    } else {
      if (funName === comparison && indexArr.length > 1) {
        //comparison sign
        const comparisonSymbol = actObj[details][compare];
        //values possibly wrapped in singleton Array, remove for comparison
        let rhsArg = listOfArgs[indexArr[1]];
        logger.info(
          `LHS value is ${lhsArg} and RHS value is ${rhsArg} when comparing  data from indexes ${indexArr[0]} and ${indexArr[1]} respectively`
        );
        //To compare 2 values taken from the pathList, we expect at most one singleton array or a primitive value; otherwise it is an error
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

        //notice it removes the array wrapper when updating with result
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
        //the non-updated argument(s) must be removed so it does not show as a result
        //listOfArgs[indexArr[1]] = undefined;
      } else {
        //REFERENCE FINDER//
        //if a reference finder action, the argument is expected to be a list of references of sort 'ResourceType/Id'
        if (funName === findRef) {
          //find Resources in context from a list of given references
          newVal = findReferencesInContext(
            hookObj,
            listOfArgs,
            actObj,
            indexArr
          );
        } else {
          //name of user-defined functions. Extend by adding label and how to apply function
          switch (funName) {
            case "getYearsFromNow":
              //this case has only one arg so index value has to be at index 0
              newVal = getYearsFromNow(lhsArg);
              break;

            case "calculate_age":
              //this case has only one arg so index value has to be at index 0
              newVal = calculate_age(lhsArg);
              break;

            case "arr_diff_nonSymm":
              //make sure they are both arrays
              let arr1 = new Array();
              let arr2 = new Array();

              if (!Array.isArray(lhsArg)) {
                arr1.push(lhsArg);
              } else {
                arr1 = lhsArg;
              }

              if (!Array.isArray(listOfArgs[indexArr[1]])) {
                arr2.push(listOfArgs[indexArr[1]]);
              } else {
                arr2 = listOfArgs[indexArr[1]];
              }

              newVal = arr_diff_nonSymm(arr1, arr2);
            //the non-updated argument(s) must be removed so it does not show as a result
            //listOfArgs[indexArr[1]] = undefined;
          }
        }
      }
      //replace argument with resulting value
      listOfArgs[indexArr[0]] = newVal;
    }
  } //endOfLoop

  //arguments are arrays so pass-by-ref, hence no need to return changes
}

/**
 * @param {Model} model model of db schema
 * @param {string} key value of parameter field
 * @param {object} actionsObj objecto containing actions and arguments
 * @returns {Array} a (possibly flattened) array with results
 */
async function getOutcomeList(
  model,
  key,
  { funListAction = [], actions = [], argsPathList = [], argsResultList = [] }
) {
  //SPECIAL CASES

  //var holding result for special cases;
  let resArr;
  //if argsResultList is empty,
  //then the purpose is to return the fetched (and possibly modified by user-defined functs)
  //value(s) from the hook context.
  if (argsResultList.length === 0) {
    //remove any undefined value from the argsPathList array before returning
    resArr = argsPathList.filter((element) => element !== undefined);
    //if there are more than one elem, send array as it is (possibly array of arrays); otherwise, flatten array into a single array
    return resArr.length > 1 ? resArr : flat(resArr, 1);
  }

  //Case where no data required to be extracted but there is some constant value that must be added for this router, regardless.
  //Then return outcome values from argsLhsList at index 0, as there is no reason to have more items in the array
  if (
    argsPathList.length === 0 ||
    argsPathList.every((elemn) => elemn === undefined)
  ) {
    resArr = argsResultList[0][outcome];
    return flat(resArr, 1);
  }

  //now for each specific action:

  //if arg at index i in argsPathList is undefined, got to i + 1 arg
  //undefined here is taken as an optional element where we have no data, so it should not alter the flow.
  //TODO: LHS could also have wildcards to denote any result is Ok. How to handle that?

  let conditionList = new Array();

  //for each action in this parameter
  for (const actionObj of actions) {
    //fetch lhs and rhs values as args.
    //Currently, we operate with 2 arguments, one from the expected result to be compared with
    //and another from the possibly modified argument. This is an array and it may contain more than
    //one argument. If so, it means a comparison between arguments was already done and the result has been
    //stored in argument at index 0

    //check  properties exist within the action object
    if (
      !(
        actionObj.hasOwnProperty(details) ||
        actionObj[details].hasOwnProperty(resultArgListIndex) ||
        actionObj[details].hasOwnProperty(pathListIndex) ||
        argsPathList.hasOwnProperty(lhsArgIndex)
      )
    )
      throw new ErrorHandler(
        500,
        `Expected properties are missing from the actionList on the DB template`
      );

    //fetch their indices first:

    //get the name of the operation
    let actionName = actionObj[action];

    //by definition, resultArgListIndex is not of array type
    let rhsArgIndex = actionObj[details][resultArgListIndex];

    //by definition, pathListIndex is an array and the value at index 0 is used
    let lhsArgIndex = actionObj[details][pathListIndex][0];

    //Next, use the lhs index to get the value for the lhs. Note that rhs could have many results to select from
    let aLHSVal = argsPathList[lhsArgIndex];

    //Now we check whether the arguments is undefined, if it is, we implicitly take it as a positive result -we added undefined to hold a position- and skip to next action
    if (aLHSVal === undefined) continue;

    //check whether we are working with an element or a singleton array
    let isSingletonLHSValue =
      Array.isArray(aLHSVal) && aLHSVal.length < 2 ? true : false;

    //if the argument is wrap in a singleton array, unwrap
    aLHSVal = isSingletonLHSValue ? aLHSVal[0] : aLHSVal;

    //now test again for the updated value.
    //At this point We have either a primitive value or an array of size gt 1
    let isLHSValList = Array.isArray(aLHSVal);

    logger.info(
      `indices and values for lhs and rhs respectively are: index lhs ${lhsArgIndex} and rhs ${rhsArgIndex}. Value lhs ${JSON.stringify(
        aLHSVal
      )}`
    );

    //If name of the operation is comparison, replace by the comparison operation sign
    if (actionName === comparison) {
      //replace with given comparison sign, unless arguments array is not a singleton
      actionName = actionObj[details][compare];
    }

    logger.info("name of action is " + actionName);

    ///now construct the query//

    //projection field
    //if index is -1, use the whole resultList array instead of just a particular element at index i
    //this is the RHS value
    let arrayElemAtRhs = {
      $arrayElemAt: ["$$resultObject." + argList, rhsArgIndex],
    };

    //object for the comparison
    let compObj; //TODO: comparison between 2 params and then result. Use param at index 0 with result

    //at this point we have as valueAtPathIndex an array w length > 1 or a primitive value
    switch (actionName) {
      case "eq":
        compObj = {
          $eq: [aLHSVal, arrayElemAtRhs],
        };
        break;
      case "gte":
        compObj = {
          $gte: [aLHSVal, arrayElemAtRhs],
        };
        break;
      case "gt":
        compObj = {
          $gt: [aLHSVal, arrayElemAtRhs],
        };
        break;
      case "lte":
        compObj = {
          $lte: [aLHSVal, arrayElemAtRhs],
        };
        break;
      case "lt":
        compObj = {
          $lt: [aLHSVal, arrayElemAtRhs],
        };
        break;

      case "inRHS": //RHS is the ResultList
        //element in resultList.argList at index i, exists in array at pathList index i'

        //2 cases:
        //case 1: LHS is not an array
        if (!isLHSValList) {
          compObj = {
            $cond: [
              //check whether the rhs is an array of values
              { $isArray: [arrayElemAtRhs] },
              //if it is, find whether LHS value exists in RHS array
              { $in: [aLHSVal, arrayElemAtRhs] },
              //otherwise find whether both elems are equal
              { $eq: [aLHSVal, arrayElemAtRhs] },
            ],
          };
        } else {
          //case 2: LHS is an array
          compObj = {
            $cond: [
              //check whether the rhs is an array of values
              { $isArray: [arrayElemAtRhs] },
              //if it is, find whether the LHS array is a subset of the RHS array
              { $setIsSubset: [aLHSVal, arrayElemAtRhs] },
              //otherwise this is false since the LHS array is by def > 1 and RHS is a primitive val
              false,
            ],
          };
        }
        break;
      case "inLHS":
        //element in array at pathList index i', exists in resultList.argList at index i
        //if element in array at pathList index i' is an array, then by default of algorithm it has size greater than 1 and the operation is a subsetOf
        if (isLHSValList) {
          compObj = {
            $cond: [
              { $isArray: [arrayElemAtRhs] },
              { $setIsSubset: [arrayElemAtRhs, aLHSVal] },
              //if it is not an array but the LHS is, then check whether the RHS exists in the LHS array
              { $in: [arrayElemAtRhs, aLHSVal] },
            ],
          };
        } else {
          //lhs arg is not an array
          compObj = {
            $cond: [
              { $isArray: [arrayElemAtRhs] },
              //if rhs is an array then this is false
              false,
              //if both are not arrays, this is an eq comparison
              { $eq: [aLHSVal, arrayElemAtRhs] },
            ],
          };
        }
        break;

      case isDescendant_strict:
        compObj = {};
        break;
    }
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
      { $match: { [paramName]: key } },
      {
        $project: {
          resultList: {
            $filter: {
              input: "$" + resultList,
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
            $push: { $concatArrays: ["$" + resultList + "." + outcome] },
          },
        },
      },
    ]);

    //flatten outcome 2 layers down max items in result
    logger.info(`result Array is ${JSON.stringify(resultArr)}`);
    mergedResults = flat(resultArr[0].results[0], 2);
  } catch (error) {
    logger.error(
      `object ${key} failed  to convert results using the DB:  ${error}`
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
  addFunctionsFromTemplateToArgsObject
};
