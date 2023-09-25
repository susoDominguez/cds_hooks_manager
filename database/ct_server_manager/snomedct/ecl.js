import {} from "dotenv/config";
import got from "got";
import jsonata from "jsonata";
import logger from "../../../config/winston.js";
import { ErrorHandler } from "../../../lib/errorHandler.js";
const { SNOMEDCT_BASE_URL, TTL_SCT } = process.env;
//create node-cache client
//import nodecache from "node-cache";
import redisClient from "../memCachedServer/redisServer.js";
import {
  paramName,
  functLabel,
  argList,
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
  isAOrEq,
  hasAOrEq,
  isSubsetOf,
  isSupersetOf,
  includes,
  isIncluded,
  In,
  contains,
  subsumes,
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
  anyElemIn,
  filterByClass,
  subsumesOrEq,
} from "../../../database/constants.js";
/////////////

//
//SNOMED CT URL with prefix and postfix strings checked and, if required, added;
let snomedCtFullPath;

//jsonata query expressions for handling successful and unsuccessful results
const jsonEclQueryExpr = `resourceType='ValueSet' ? (expansion[total > 0] ? expansion.contains[].code : []) : 'Error: ' & issue.diagnostics`;
const jsonataSubsumptinExpr = `resourceType = 'Parameters' ? parameter[name='outcome'].valueString : 'Error: ' & issue.diagnostics`;
const jsonataQuerySCT = `resourceType = 'Parameters' ? parameter[name='outcome'].valueString : resourceType='ValueSet' ? (expansion[total > 0] ? expansion.contains[].code : []) : ('Error: ' & issue.diagnostics)`;
//active codes only
const activeCodesParams = "&activeFilter=true&termActive=true";
const snomedUrl = "http://snomed.info/sct";

/**
 * get value form memcached otherwise execute SNOMED CT operation and set memcached as url -> value
 * @param {*} url
 * @returns
 */
async function getCachedValue(url) {

  //fetch value then store it in cached memory
  let querySCT = await redisClient.get(url);
  
  //if value undefined, handle miss
  if (querySCT) {
    //it was stringified, parse
    querySCT = JSON.parse(querySCT);
    logger.info(`Cached value is ${JSON.stringify(querySCT)}`);
    return querySCT;
  } else { 
    return got(url)
      .json()
      .then((response) => {
        let resp, respStr ;
        try {
          //evaluate expression against JSON structure
          resp = jsonata(jsonataQuerySCT).evaluate(response);
          respStr = JSON.stringify(resp); 
          logger.info(`jsonata response is ${respStr}}`);
          //catch any error while evaluating expression with jsonata
        } catch (err) {
          return Promise.reject(
            err.response && err.response.body ? err.response.body : err
          );
        }
         //if contains error, reject
         if (respStr.startsWith("Error:")) {
          return Promise.reject(resp);
        }
        //store result
        //if(Array.isArray(resp) && resp.length === 0) resp = JSON.stringify(resp);
        redisClient.set(url, respStr,'EX', TTL_SCT).then(val => logger.debug(`the response of Redis server is ${val}`)).catch(err=>{logger.debug(`the error rewsponse of REDIS is ${err}`)});
        //if all successful, return response
        return Promise.resolve(resp);
      })
  }
  //return querySCT;
}

function checkEnvVars(
  {
    action,
    details: { arg1, termSystem, arg2, codeSystem, version, filter, count },
  },
  codesA,
  codesB
) {
  //check environment is set correctly
  if (
    typeof SNOMEDCT_BASE_URL === "undefined" ||
    typeof SNOMEDCT_BASE_URL !== "string"
  )
    throw new ErrorHandler(
      500,
      "Base URL for SNOMEDCT browser has not been correctly defined as an environment variable."
    );

  //check it starts and ends with expected prefix and postfix, otherwise add it
  if (typeof snomedCtFullPath === "undefined") {
    snomedCtFullPath = SNOMEDCT_BASE_URL;
    if (!snomedCtFullPath.startsWith("https://"))
      snomedCtFullPath = "https://" + snomedCtFullPath;
    if (!snomedCtFullPath.endsWith("/fhir")) snomedCtFullPath += "/fhir";
  }

  //check there is an action to be applied
  if (!action)
    throw new ErrorHandler(
      500,
      ` definition is missing action field for object ${JSON.stringify({
        arg1,
        termSystem,
        arg2,
        codeSystem,
        version,
        filter,
        count,
      })}.`
    );

  //check parameters are Array constructs
  if (!(Array.isArray(codesA) && Array.isArray(codesB))) {
    throw new ErrorHandler(
      500,
      "Error: both parameters arg1 and arg2 were expected to be Array constructs or wrapped in Arrays."
    );
  }

  //check parameters are valid
  for (let index = 0; index < codesA.length; index++) {
    const element = codesA[index];
    if (isNaN(element))
      throw new ErrorHandler(
        500,
        `SNOMED CT concept for arg1: ${element} is not a valid number.`
      );
  }
  //codesB is not always required
  for (let index = 0; index < codesB.length; index++) {
    const element = codesB[index];
    //if null value, continue
    if (typeof element === "undefined" && index === 0) continue;

    if (isNaN(element))
      throw new ErrorHandler(
        500,
        `SNOMED CT concept for arg2: ${element} is not a valid number.`
      );
  }

  //check count is numeric
  if (count && isNaN(count))
    throw new ErrorHandler(
      500,
      `count limit ${count} for SNOMED CT query expression is not a valid number.`
    );
  //check codeSystem is numeric
  if (codeSystem && isNaN(codeSystem))
    throw new ErrorHandler(
      500,
      `codeSystem ${codeSystem} for SNOMED CT query expression is not a valid number.`
    );
  //check version is numeric
  if ((!codeSystem && version) || (version && isNaN(version)))
    throw new ErrorHandler(
      500,
      `version ${version} for SNOMED CT query expression is not a valid number or no codeSystem value has been entered.`
    );
}

/**
 *  Resolve SNOMED CT queries. Queries are not restricted to non-array values;
 * however, if an array is fed for subsumption, the array in arg1 would be considered as an disjunction of conjunctions
 * so that if arg[n] resolves to truth with respect to arg2[m] then arg1 also resolves to truth for arg2[m].
 * @param {Object} actionObj an action as taken from the MongoDB eform
 * @param {Array} codesA codes to be added to query
 * @param {Array | undefined} codesB codes to be added to subsumption queries
 * @returns {Promise<[][]>} returns an array of arrays of length codesA.length
 */
async function getSnomedQueryResult(actionObj, codesA, codesB) {
  //convert both arguments to arrays
  if (!Array.isArray(codesA)) codesA = [codesA];
  if (!Array.isArray(codesB)) codesB = [codesB];
  //response var of length arg1
  let res = new Array();

  //check environmnet variables (for SNOMED CT queries)
  checkEnvVars(actionObj, codesA, codesB);

  try {
    for (let indexA = 0; indexA < codesA.length; indexA++) {
      const codeA = codesA[indexA];
      var tempArr = new Array();
      for (let indexB = 0; indexB < codesB.length; indexB++) {
        const codeB = codesB[indexB];
        //add SCT query
        tempArr.push(getCachedValue(setSnomedQuery(actionObj, codeA, codeB)));
      } //endOf loop
      //resolve promise for all SCT queries
      //add to result of main query
      res.push(Promise.all(tempArr));
    } //endOf loop
    res = await Promise.all(res);
  } catch (err) {
    throw new ErrorHandler(
      500,
      "getSnomedQueryResult: " +
        (err.response && err.response.body
          ? err.response.body
          : err.message
          ? err.message
          : err)
    );
  }
  //return promise
  return res;
}

/**
 * Defines a SNOMED CT query expression
 * @param {Object}  action_object object containing the details on the SNOMED CT query
 * @param {String} codeA first code
 * @param {String | undefined} codeB second code
 * @returns url with parameters
 */
function setSnomedQuery(
  {
    action,
    details: {
      arg1,
      arg2,
      termSystem = "SCT",
      codeSystem,
      version,
      filter,
      count,
    },
  },
  codeA,
  codeB
) {
  //no arrays
  if (Array.isArray(codeA) || Array.isArray(codeB))
    throw new ErrorHandler(
      500,
      `setIsaQueryExpr: array of codes are not accepted by this function. codeA = ${codeA} and codeB = ${codeB}`
    );

  //which query expr is it?

  //currently, the query checks for subsumed | subsumed-by | equivalent
  return action === isA ||
    action === isAOrEq ||
    action === hasA ||
    action === hasAOrEq ||
    action === subsumes ||
    action === subsumesOrEq ||
    action === filterByClass //codeA is of type codeB : subsumed by
    ? setIsaQueryExpr(codeA, codeB, codeSystem, version)
    : setEclQuery(action, codeA, count, codeSystem, version, filter);
}

/**
 * Construct query expression arg1 is_a arg2 to check whether arg1 is subsumed by, or equivalent to, arg2.
 * @param {String} codeA snomed ct id applied as first argument of the operator is_a (is arg1 subsumed by arg2?)
 * @param {String} codeB snomed ct id applied as second argument of the operator is_a (does arg2 susbsumes arg1?)
 * @param {String} codeSys snomed ct code system (optional)
 * @param {String} version snomed ct version of code system (optional)
 * @returns  the SNOMED CT query expression
 */
function setIsaQueryExpr(codeA, codeB, codeSys, version) {
  //postfix to set a ECL query
  let urlCodeSys = `/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=${codeA}&codeB=${codeB}${activeCodesParams}`;
  //construct url using snomedCtFullPath
  const finalUrl =
    snomedCtFullPath +
    urlCodeSys +
    `${codeSys ? `&version=${snomedUrl}/${codeSys}` : ""}${
      codeSys && version ? `/version/${version}` : ""
    }`;

  logger.info(`setIsaQueryExpr: url is ${finalUrl}`);

  return finalUrl;
}

/**
 *
 * @param {String} expression operator applied to this query expression
 * @param {String} code SNOMED CT code
 * @param {Number} count results query limit
 * @param {String} codeSys (optional) code system
 * @param {String} version (optional) version of code system
 * @param {String} filter (optional) term filtering the search
 * @returns {String} the query expression
 */
function setEclQuery(expression, code, count, codeSys, version, filter) {
  let url = `/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/`;

  let postUrl = `${code}${count ? `&count=${count}` : ""}${
    codeSys ? `&system-version=${snomedUrl}/${codeSys}` : ""
  }${codeSys && version ? `/version/${version}` : ""}${
    filter ? `&filter=${filter}` : ""
  }${activeCodesParams}`;

  //operator by default is - descendant or self of
  let op = `<<`;

  switch (expression) {
    case parentOf:
      op = `>!`;
      break;
    case parentOrSelfOf:
      op = `>>!`;
      break;
    case childOf:
      op = `<!`;
      break;
    case childOrSelfOf:
      op = `<<!`;
      break;
    case descendantOf:
      op = `<`;
      break;
    case ancestorOf:
      op = `>`;
      break;
    case ancestorOrSelfOf:
      op = `>>`;
      break;
    default: //descendant or self of
      break;
  }
  const finalUrl = snomedCtFullPath + url + op + postUrl;

  logger.info(`setEclQuery: ${expression} url is ${finalUrl}`);
  //add altogether and return
  return finalUrl;
}

export default getSnomedQueryResult;
export { jsonEclQueryExpr, jsonataSubsumptinExpr as jsonIsaExpr };
