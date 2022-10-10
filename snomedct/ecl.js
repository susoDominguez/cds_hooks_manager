import {} from "dotenv/config";
import got from "got";
import logger from "../config/winston.js";
import { ErrorHandler } from "../lib/errorHandler.js";
const { SNOMEDCT_BASE_URL } = process.env;
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

//jsonata query expressions for handling successful and unsuccessful results
const jsonEclQueryExpr = `resourceType='ValueSet' ? (expansion[total > 0] ? expansion.contains[].code : []) : 'Error: ' & issue.diagnostics`;
const jsonIsaExpr = `resourceType='Parameters' ? (parameter.valueString='subsumed-by' or parameter.valueString='equivalent') : 'Error: ' & issue.diagnostics`;

//active codes only
const activeCodesParams = "&activeFilter=true&termActive=true";
const snomedUrl = "http://snomed.info/sct";

function checkEnvVars(
  {
    action,
    details: { arg1, termSystem, arg2, codeSystem, version, filter, count },
  },
  codesA,
  codesB=undefined
) {
  //check environment is set correctly
  if (!SNOMEDCT_BASE_URL)
    throw new ErrorHandler(
      500,
      "Base URL for SNOMEDCT browser has not been defined as an environment variable."
    );
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

  //check parameters are valid
  if (Array.isArray(codesA)) {
    for (let index = 0; index < codesA.length; index++) {
      const element = codesA[index];
      if (isNaN(element))
        throw new ErrorHandler(
          500,
          `SNOMED CT concept for arg1: ${element} is not a valid number.`
        );
    }
  }

  if (typeof codesB === 'undefined' && Array.isArray(codesB)) {
    for (let index = 0; index < codesB.length; index++) {
      const element = codesB[index];
      if (isNaN(element))
        throw new ErrorHandler(
          500,
          `SNOMED CT concept for arg2: ${element} is not a valid number.`
        );
    }
  }

  if (count && isNaN(count))
    throw new ErrorHandler(
      500,
      `count limit ${count} for SNOMED CT query expressxion is not a valid number.`
    );

  if (codeSystem && isNaN(codeSystem))
    throw new ErrorHandler(
      500,
      `count limit ${codeSystem} for SNOMED CT query expressxion is not a valid number.`
    );

  if (version && isNaN(version))
    throw new ErrorHandler(
      500,
      `count limit ${version} for SNOMED CT query expressxion is not a valid number.`
    );
}

/**
 *  Resolve SNOMED CT queries. Queries are not restricted to non-array values;
 * however, if an array is fed for subsumption, the array in arg1 would be considered as an disjunction of conjunctions
 * so that if arg[n] resolves to truth with respect to arg2[m] then arg1 also resolves to truth for arg2[m].
 * @param {Object} actionObj an action as taken from the MongoDB eform
 * @param {Array} codesA codes to be added to query
 * @param {Array | undefined} codesB codes to be added to subsumption queries
 * @returns {Array} returns an array of arrays of length codesA.length
 */
async function getSnomedQueryResult(actionObj, codesA, codesB) {
  //reesponse var
  let res;
  //type is array for both or also undefined for codesB
  if (!Array.isArray(codesA) || (codesB && !Array.isArray(codesB))) throw new ErrorHandler(
    500,
    `getSnomedQueryResult: type of parameters codesA or codesB is not an array.`
  )
//wrap undefined value in an array also
  if(!codesB) codesB = [codesB];

  //check environmnet variables
  checkEnvVars(actionObj, codesA, codesB);

  //execute queries:
  //1. set the query expression for all arg1 and arg2
  //2. map got to each expression
  //3.Promise result
  //4. return result or catch error and throw

  try {
    res = await Promise.all(
      codesA.map((codeA) => {
        let promises = Promise.all(
          codesB.map((codeB) =>
            got(setSnomedQuery(actionObj, codeA, codeB)).json()
          )
        );
        return promises;
      })
    );

    logger.info("getSnomedQueryResult: returns = " + JSON.stringify(res));
  } catch (error) {
    throw new ErrorHandler(500, "getSnomedQueryResult: " + error.message);
  }
  //return array of results
  return res;
}

/**
 * Defines a SNOMED CT query expression
 * @param {Object}  action_object object containing the details on the SNOMED CT query
 * @param {String} codeA first code
 * @param {String} codeB second code
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
  if (Array.isArray(codeA) || (codeB && Array.isArray(codeB)))
    throw new ErrorHandler(
      500,
      `setIsaQueryExpr: array of codes are not accepted by this function. codeA = ${codeB} and codeB = ${codeB}`
    );
  //which query expr is it?

  return action === "is_a"
    ? setIsaQueryExpr(codeA, codeB, codeSystem, version)
    : action === "has_a"
    ? setIsaQueryExpr(codeB, codeA, codeSystem, version)
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
  //checks
  if (isNaN(codeB))
    throw new ErrorHandler(500, `SNOMED CT concept ${codeB} is not a number.`);
  //construct url using baseUrl
  let urlCodeSys = `/CodeSystem/$subsumes?codeA=${codeA}&codeB=${codeB}${activeCodesParams}`;
  //add version
  let baseUrl = !SNOMEDCT_BASE_URL.endsWith("/fhir")
    ? "https://" + SNOMEDCT_BASE_URL + "/fhir"
    : "https://" + SNOMEDCT_BASE_URL;

  const finalUrl =
    baseUrl +
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
  let baseUrl = !SNOMEDCT_BASE_URL.endsWith("/fhir")
    ? "https://" + SNOMEDCT_BASE_URL + "/fhir"
    : "https://" + SNOMEDCT_BASE_URL;

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
  const finalUrl = baseUrl + url + op + postUrl;

  logger.info(`setEclQuery: ${expression} url is ${finalUrl}`);
  //add altogether and return
  return finalUrl;
}

export default getSnomedQueryResult;
export { jsonEclQueryExpr, jsonIsaExpr };
