"use strict";

const JSONPathPlus = require("jsonpath-plus");
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
} = require("../../database_modules/constants.js");
const flat = require("array.prototype.flat");
const {
  arr_diff_nonSymm,
  calculate_age,
  arr_diff,
  getYearsFromNow,
} = require("./user-defined-functions");
const { ErrorHandler } = require("../../lib/errorHandler");
const logger = require("../../config/winston");
const { Model } = require("mongoose");

///////////////////////////////////////////////////////

/**
 * add parameter and corresponding args to Map
 * @param {object} contextObj
 * @param {object} docObj
 *
 */
function getPathValueAndActions(contextObj, docObj) {
  //get actions
  let actionArray = docObj[actionList];

  //check we are working w array
  if (!Array.isArray(actionArray))
    throw new Error(
      actionList + " object from MongonDB is not an array as expected"
    );

  /// HANDLE ACTIONS

  //filter actions: function (goes first), comparison(second) and arra_eq (goes last)
  //object to be returned as output of this function
  let argVals = {
    funListAction: actionArray.filter(
      (obj) =>
        obj[action] === functLabel ||
        obj[action] === findRef ||
        (obj[action] === comparison && obj[details][pathListIndex].length > 1)
    ),
    //filter only comparisons with the resultList; they have at most one argument form argList
    actions: actionArray.filter(
      (obj) =>
        //not equal to any of the above elements
        (obj[action] !== functLabel &&
          obj[action] !== findRef &&
          obj[action] !== comparison) ||
        //or if it is a comparison, it has more than one argument
        (obj[action] === comparison && obj[details][pathListIndex].length < 2)
    ),
    argsPathList: new Array(),
    argsResultList: docObj[resultList],
  };

  //check they are arrays
  if (!Array.isArray(argVals.funListAction) || !Array.isArray(argVals.actions))
    throw new Error(
      "actionLists have not been created dynamically as expected"
    );

  //logger.info("Object argsVals is " + JSON.stringify(argVals, null,2));

  //three stages: path, actions-functions and action-results.
  //First fetch parameters, type properly, apply functions and add to MAP.
  //THen apply to already existing MAP object the actions for comparisons to find results
  //or the existing result if not comparison is needed

  //paths:
  const pathObj = docObj[pathList];

  //by checking if type array, it types pathObj
  if (!Array.isArray(pathObj))
    throw new Error("field paths expected to be an array.");

  //for each path in pathList. If path is empty list, deal with it later
  for (const aPath of pathObj) {
    if (
      !(
        aPath.hasOwnProperty(typePath) ||
        aPath.hasOwnProperty(isMandatory) ||
        aPath.hasOwnProperty(xpath)
      )
    )
      throw Error(`property missing in object PathList from template`);

    //type of path
    let typepath = aPath[typePath];

    //is this data optional?
    let isOptional = !aPath[isMandatory];

    //string with the xpath to value and the default value
    let pathToVal = aPath[xpath];

    //get default value (possibly undefined) and check whether it is also a path to data in a resource
    let defaultPathToVal = aPath[defaultVal];

    //are we dealing with another Xpath format?
    let isDefaultValXpath =
      defaultPathToVal !== undefined &&
      (("" + defaultPathToVal).startsWith("$.") ||
        ("" + defaultPathToVal).startsWith("$["));

    //obtain value from request body. If not found, it returns undefined.
    //Also could be undefined on purpose to add user-defined values in default.
    let dataInXpath =
      pathToVal && pathToVal.trim() !== ""
        ? getDataFromContext(pathToVal, contextObj)
        : undefined;

    //if undefined, get the default value which could also be undefined or a Xpath of the same type as the main one
    if (dataInXpath === undefined) {
      //if default is a path, apply Jsonpath otherwise return the value
      dataInXpath = isDefaultValXpath
        ? getDataFromContext(defaultPathToVal, contextObj)
        : defaultPathToVal;
    }

    logger.info(
      "value(s) found in Resources are: " + JSON.stringify(dataInXpath)
    );

    //if this parameter is still undefined :
    if (dataInXpath === undefined) {
      //but optional:
      if (isOptional) {
        //return undefined to hold the position in the array of arguments
        argVals["argsPathList"].push(undefined);
        //then continue to next iteration
        continue;
      } else {
        //if mandatory, end process and send error
        throw Error(
          `parameter ${docObj[paramName]} has an undefined value but it seems it should have at least a default value as it is mandatory.`
        );
      }
    }

    /// VALUE IS ALREADY EXTRACTED ///

    //typing the extracted data
    dataInXpath = typePathVal(typepath, dataInXpath);

    //is it an array path?
    //let isArrayData = Array.isArray(dataInXpath);

    //add value to list after potentially applying a function on it. Remove from arra wrapping if required
    argVals["argsPathList"].push(dataInXpath);
  }

  //return object with actions and arguments
  return argVals;
}

/**
 *
 * @param {string} jsonpath path to values
 * @param {object} contextObj hook context
 */
function getDataFromContext(jsonpath, contextObj) {
  return jsonpath === undefined || jsonpath === null || jsonpath.trim() === ""
    ? undefined
    : JSONPathPlus.JSONPath({
        path: jsonpath,
        wrap: false,
        flatten: true,
        json: contextObj,
      });
}

/**
 * Convert values to specified type
 * @param {Array} dataInXpath array or primitive value extracted from resource
 * @return {Array} dataInXpath
 */
function typePathVal(typepath, dataInXpath) {

  //number of iterations to do on the switch command.
  //one is default as the first one is mandatory by using do-while loop
  let iters = 1;

  //if of type array then add values to array. If not, do it just once
  //is it an array path?
  let isArrayData = Array.isArray(dataInXpath);

  //logger.info(
  //  "is oftype array the data extracted using JSONPath? " + isArrayData
  // );

  //we are expecting an Array of primitive values. Array of Arrays will not work
  if (isArrayData) {
    //iterations equal to length of array
    iters = dataInXpath.length;
  } else {
    //if not an array, wrap into an array for consistency in function application.
    let temp = dataInXpath;
    //Then unwrap for finalising result
    dataInXpath = new Array();
    dataInXpath.push(temp);
  }

  do {
    let tempVal = dataInXpath[iters - 1];
    //logger.info("tempVal at typing process is " + tempVal);

    //logger.info(`value at  path is ${JSON.stringify(temp)}`);
    //if type of value is not String, then change type as specified
    switch (typepath) {
      case "date":
        dataInXpath[iters - 1] = new Date(tempVal);
        break;
      case "number":
        dataInXpath[iters - 1] = Number(tempVal);
        break;
      case "boolean":
        dataInXpath[iters - 1] = tempVal == 1; //TODO: check other ways to convert values into booleans
        break;
      case "string":
        dataInXpath[iters - 1] = "" + tempVal;
        break;
    }

    //iterate
  } while (--iters > 0);

  //if initial data was not an array, unwrap it from the array we created
  if (!isArrayData) dataInXpath = dataInXpath[0];

  return dataInXpath;
}

/*** Applies user defined functions or actions where all the arguments come from the CDS Hook.
 * Order of application matters. Note that findRef > user-defined functs > comparison between hook data as arguments
 *  @param {object} hookObj hook context with resources. To be used on a reference find
 * @param {array} funListAction array with functions
 * @param {array} listOfArgs array with  arguments
 */
function applyActions(hookObj, funListAction, listOfArgs) {
  //if empty, there are no middle actions to be applied at this moment
  if (funListAction == []) return;

  //apply mid-process action to values in list of arguments
  for (const actObj of funListAction) {
    //name of function
    let funName;
    if (actObj.hasOwnProperty(action) && actObj.hasOwnProperty(details)) {
      //if it is labelled as function, use the function name given in details property
      funName =
        actObj[action] === functLabel
          ? actObj[details][functName]
          : actObj[action];
    } else {
      logger.error(
        `property ${action} or  ${details} are not found in object ActionList on template`
      );
      throw Error(
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
      logger.error(
        `property ${details} or ${pathListIndex}  are not found in object ActionList on template`
      );
      throw Error(
        `property ${details} or ${pathListIndex} are not found in object ActionList on template`
      );
    }

    //if anything fails, throw error
    if (!Array.isArray(indexArr))
      throw Error(
        `MongoDb error: actionList has issues with a function on the MongoDb. Check details of function ${funName}.`
      );

    //this var will contain the resulting value to replace the initial arguments
    let newVal;

    ///begin with comparison between arguments. resulting boolean value is stored in first given argument, ie., lhs arg
    //the rhs argument must be nullified so that it does not show in the reply
    //then user-defined functions
    if (funName === comparison && indexArr.length > 1) {
      //comparison sign
      const comparisonSymbol = actObj[details][compare];
      //values possibly wrapped in singleton Array, remove for comparison
      var lhsArg = listOfArgs[indexArr[0]];
      var rhsArg = listOfArgs[indexArr[1]];
      logger.info(`LHS value is ${lhsArg} and RHS value is ${rhsArg} when comparing  data from indexes ${indexArr[0]} and ${indexArr[1]} respectively`);
      //To compare 2 values taken from the pathList, we expect at most one singleton array or a primitive value; otherwise it is an error
      //if singleton array, fetch value else error
      if (Array.isArray(lhsArg) && lhsArg.length < 2) {
        lhsArg = lhsArg[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (Array.isArray(lhsArg))
          throw Error(
            `action comparison from template DB has more than 1 argument on its RHS parameter (array)`
          );
      }
      if (Array.isArray(rhsArg) && rhsArg.length < 2) {
        rhsArg = rhsArg[0];
      } else {
        //if it is an array then it must have size greater than 2
        if (Array.isArray(rhsArg))
          throw Error(
            `comparison action has more than 1 argument on its LHS parameter (array?) when only one argument was expected`
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
      //if a reference finder action, the argument is expected to be a list of references of sort 'ResourceType/Id'
      if (funName === findRef) {
        //check for properties
        if (
          !(
            actObj.hasOwnProperty(details) ||
            actObj[details].hasOwnProperty(xpath) ||
            actObj[details].hasOwnProperty(typePath)
          )
        )
          throw Error(
            `property ${details} is missing  property ${xpath} or ${typePath} in object ActionList on template`
          );

        //xpath is expected to be written with 2 placeholders: var1 and var2
        let xPath = actObj[details][xpath] || undefined;
        let typing = actObj[details][typePath] || undefined;

        //get list of references
        let refArr = listOfArgs[indexArr[0]];

        //list of results that will replace the list of arguments at the given index of the general argsList array
        let tempList = new Array();

        //for each reference
        for (const refString of refArr) {
          //replace var1 and var2 by refString parts
          let refWords = refString.split("/");

          //find value in Path.
          //replace placeholders by FHIR ResourceType and FHIR Id
          let temp = getDataFromContext(
            xPath.replace("var1", refWords[0]).replace("var2", refWords[1]),
            hookObj
          );

          //add to temp list
          tempList.push(temp);
        }
        //typing of values
        //replace args with new data list
        newVal = typePathVal(typing, tempList);
      } else {
        //name of user-defined functions. Extend by adding label and how to apply function
        switch (funName) {
          case "getYearsFromNow":
            //this case has only one arg so index value has to be at index 0
            newVal = getYearsFromNow(listOfArgs[indexArr[0]]);
            break;
          case "calculate_age":
            //this case has only one arg so index value has to be at index 0
            newVal = calculate_age(listOfArgs[indexArr[0]]);
            break;
          case "arr_diff_nonSymm":
            newVal = arr_diff_nonSymm(
              listOfArgs[indexArr[0]],
              listOfArgs[indexArr[1]]
            );
          //the non-updated argument(s) must be removed so it does not show as a result
          //listOfArgs[indexArr[1]] = undefined;
        }
      }
    }
    //replace argument with resulting value
    listOfArgs[indexArr[0]] = newVal;
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
        argsPathList.hasOwnProperty(indexPathArg)
      )
    )
      throw Error(
        `Expected properties are missing from the actionList on the DB template`
      );

    //fetch their indices first:

    //by definition, resultArgListIndex is not of array type
    let indexResultArg = actionObj[details][resultArgListIndex];

    //by definition, pathListIndex is an array and the value at index 0 is used
    let indexPathArg = actionObj[details][pathListIndex][0];

    //Next, use the indexPathArg to get the value for the lhs. Note that rhs could have many results to select from
    let valueAtPathIndex = argsPathList[indexPathArg];

    //Now we check whether any of the arguments is undefined, if it is, we implicitly take it as a positive result and skip to next action
    if (valueAtPathIndex === undefined) continue;

    //check whether we are working with an element or a singleton array
    let isSingletonArrValueAtPathIndex =
      Array.isArray(valueAtPathIndex) && valueAtPathIndex.length < 2
        ? true
        : false;
    //if the argument is wrap in a singleton array, unwrap
    valueAtPathIndex = isSingletonArrValueAtPathIndex
      ? valueAtPathIndex[0]
      : valueAtPathIndex;

    //now test again for the updated value.
    //At this point We have either a primitive value or an array of size gt 1
    let isArrayValueAtPathIndex = Array.isArray(valueAtPathIndex);

    logger.info(
      `indices and values for lhs and rhs respectively are: index lhs ${indexPathArg} and rhs ${indexResultArg}. Value lhs ${JSON.stringify(
        valueAtPathIndex
      )}`
    );

    //get the name of the operation
    let actionName = actionObj[action];

    //If name of the operation is comparison, replace by the comparison operation sign
    if (actionName === comparison) {
      //replace with given comparison sign, unless arguments array is not a singleton
      actionName = actionObj[details][compare];
    }

    logger.info("action name is " + actionName);

    ///now construct the query//

    //projection field
    //if index is -1, use the whole resultList array instead of just a particular element at index i
    //this is the RHS value
    let resultArgAtIndexObj = {
      $arrayElemAt: ["$$resultObject." + argList, indexResultArg],
    };

    /*
    logger.info(
      "resultArgAtIndexObj name is " + JSON.stringify(resultArgAtIndexObj)
    );*/

    //object for the comparison
    let compObj; //TODO: comparison between 2 params and then result. Use param at index 0 with result

    //at this point we have as valueAtPathIndex an array w length > 1 or a primitive value
    switch (actionName) {
      case "eq":
        compObj = {
          $eq: [valueAtPathIndex, resultArgAtIndexObj],
        };
        break;
      case "gte":
        compObj = {
          $gte: [valueAtPathIndex, resultArgAtIndexObj],
        };
        break;
      case "gt":
        compObj = {
          $gt: [valueAtPathIndex, resultArgAtIndexObj],
        };
        break;
      case "lte":
        compObj = {
          $lte: [valueAtPathIndex, resultArgAtIndexObj],
        };
        break;
      case "lt":
        compObj = {
          $lt: [valueAtPathIndex, resultArgAtIndexObj],
        };
        break;
      case "inRHS": //RHS is the ResultList
        //element in resultList.argList at index i, exists in array at pathList index i'

      //2 cases:
      //case 1: LHS is not an array
      if(!isArrayValueAtPathIndex) {
        compObj = {
          $cond: [
            //check whether the rhs is an array of values
            { $isArray: [resultArgAtIndexObj] },
            //if it is, find whether the first elem exists in the second
            { $in: [valueAtPathIndex, resultArgAtIndexObj] },
            //otherwise find whether both elems are equal
            { $eq: [valueAtPathIndex, resultArgAtIndexObj] }
          ]
        };
      } else {
        //case 2: LHS is an array
        compObj = {
          $cond: [
            //check whether the rhs is an array of values
            { $isArray: [resultArgAtIndexObj] },
            //if it is, find whether the first array is a subset of the second
            { $setIsSubset: [valueAtPathIndex, resultArgAtIndexObj] },
            //otherwise this is false since an array cannot be in on elem
            false
          ],
        };
      }
       break;
      case "inLHS": 
        //element in array at pathList index i', exists in resultList.argList at index i
        //if element in array at pathList index i' is an array, then by default of algorithm it has size greater than 1 and the operation is a subsetOf
        if (isArrayValueAtPathIndex) {
          compObj = {
            $cond: [
              { $isArray: [resultArgAtIndexObj] },
              { $setIsSubset: [resultArgAtIndexObj, valueAtPathIndex] },
              //if it is not an array but the LHS is, then check whether the RHS exists in the LHS array
              { $in: [resultArgAtIndexObj, valueAtPathIndex ] }
            ]
          };
        } else {
          //lhs arg is not an array
          compObj = {
            $cond: [
              { $isArray: [resultArgAtIndexObj] },
              //if rhs is an array then this is false
              false,
              //if both are not arrays, this is an eq comparison
              { $eq: [valueAtPathIndex, resultArgAtIndexObj] },
            ],
          };
        }

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
            $push: { $concatArrays: ["$" + resultList + "." + outcome] }
          }
        }
      }
    ]);

    //flatten outcome 2 layers down max items in result
    logger.info(`result Array is ${JSON.stringify(resultArr)}`);
    mergedResults = flat(resultArr[0].results[0],2);
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

module.exports = { getPathValueAndActions, getOutcomeList, applyActions };
