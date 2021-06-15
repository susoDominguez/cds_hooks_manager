"use strict";
const {
  patientId
} = require("../../database_modules/constants.js");
const logger = require("../../config/winston");


exports.manipulateData = async function (req, res, next) {

  //map with parameters and their extracted values
  const paramsMap = res.locals.parametersMap;

  /////////////////// extract patient identifier

  //response object to contain data which will be pass to the next middleware
  res.locals.cdsData = {
    patient: undefined,
    assessedCopdGroup_code: undefined,
    copdGroupsObj: {}
  };

  if (paramsMap.has(patientId)) {
    let resultArr = paramsMap.get(patientId);
    res.locals.cdsData[patientId] = resultArr[0];
    logger.info(`patient is ${res.locals.cdsData[patientId]}`);
  } else {
    res.locals.cdsData[patientId] = "dummyPatient";
  }
  
  ///
  ///assess-copd-group
  ///

  if ( paramsMap.has("assessed-copd-group") ) {
    let resultArr = paramsMap.get("assessed-copd-group");
    let temp = resultArr[0];
    res.locals.cdsData.assessedCopdGroup_code = temp;
    logger.info(`assessedCopdGroup_code is ${res.locals.cdsData.assessedCopdGroup_code}`);
  } else {
    logger.error(
      `assessed-copd-group is missing`
    );
    throw Error(
        `assessed-copd-group is missing`
    );
  }

  ///

  if (paramsMap.has("copdGroupA")) {
    let resultArrA = paramsMap.get("copdGroupA");
    res.locals.cdsData.copdGroupsObj.groupA = resultArrA;
    logger.info(`copdGroupA is ${JSON.stringify(res.locals.cdsData.copdGroupsObj.groupA)}`);
  }  else {
    logger.error(
      `copdGroupA is missing`
    );
    throw Error(
        `copdGroupA is missing`
    );
  }

  if (paramsMap.has("copdGroupB")) {
    let resultArrB = paramsMap.get("copdGroupB");
    res.locals.cdsData.copdGroupsObj.groupB = resultArrB;
    logger.info(`copdGroupB is ${JSON.stringify( res.locals.cdsData.copdGroupsObj.groupB )}`);
  }  else {
    logger.error(
      `copdGroupB is missing`
    );
    throw Error(
        `copdGroupB is missing`
    );
  }

  if (paramsMap.has("copdGroupC")) {
    let resultArrC = paramsMap.get("copdGroupC");
    res.locals.cdsData.copdGroupsObj.groupC = resultArrC;
    logger.info(`copdGroupC is ${JSON.stringify(res.locals.cdsData.copdGroupsObj.groupC)}`);
  }  else {
    logger.error(
      `copdGroupC is missing`
    );
    throw Error(
        `copdGroupC is missing`
    );
  }

  if (paramsMap.has("copdGroupD")) {
    let resultArrD = paramsMap.get("copdGroupD");
    res.locals.cdsData.copdGroupsObj.groupD = resultArrD;
    logger.info(`copdGroupD is ${JSON.stringify(res.locals.cdsData.copdGroupsObj.groupD)}`);
  }  else {
    logger.error(
      `copdGroupD is missing`
    );
    throw Error(
        `copdGroupD is missing`
    );
  }

    //cal next middleware
    next();
};