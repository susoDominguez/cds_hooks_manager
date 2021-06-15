var express = require("express");
var router = express.Router();
const { ErrorHandler } = require("../lib/errorHandler");
const logger = require("../config/winston");
const {
  TREATMENT_SELECT_ROUTE,
  TREATMENT_REVIEW_ROUTE,
  CIGS_MERGE_ROUTE
} = process.env;
var { fetchParams, getCdsServices } = require("../middleware/data-processing-component");
var { fetchTmrData_copd } = require("../middleware/using_tmr-careplan-select-hooks/cig-interaction-component");
var { fetchTmrData } = require("../middleware/cig-interaction-component_noArgumentation");
var { manipulateData } = require("../middleware/copd-assess-hook/data-manipulation-component");
var { aggregateData } = require("../middleware/data-aggregation-component");

const asyncMiddleware = require("../lib/asyncMiddleware");

const copd_assess =
  TREATMENT_REVIEW_ROUTE || "copd-assess";
const copd_careplan_select =
  TREATMENT_SELECT_ROUTE || "copd-careplan-select";//DB-HT-OA-merge

/* GET cds-services on this server. */
router.get("/", asyncMiddleware(getCdsServices),
function (req, res, next) {
  //response
  res.status(200).json(res.locals.cdsServices);
});

/* POST assess COPD severity and drug preferences as denoted in GOLD COPD 2017 CG. */ 
router.post(
  "/" + copd_assess,
  asyncMiddleware(fetchParams),
  //below is distinct because it does not access TMR
  asyncMiddleware(manipulateData),
  asyncMiddleware(aggregateData),
  (req, res, next) => {
    //send CDS data, wrapped in CDS Card, back to EHR client
    res.status(200).json(res.locals.cdsData); 
  }
);

/* POST provide personalised COPD care plan */
router.post(
  "/" + copd_careplan_select,
  asyncMiddleware(fetchParams),
  //asyncMiddleware(fetchTmrData_copd),
  asyncMiddleware(aggregateData),
  (req, res, next) => {
      //send CDS data, wrapped in CDS Card, back to EHR client
      //res.status(200).json(res.locals.cdsData); 
      res.status(200).json({
        'cigInvolvedList' : res.locals.cigInvolvedList,
        'parametersMap' : res.locals.parametersMap
      }); 
  }
);

/* POST provide personalised care plan with no argumentation */
router.post(
  '/tmr/(*)-careplan-select',
  asyncMiddleware(fetchParams),
  //asyncMiddleware(fetchTmrData),
  asyncMiddleware(aggregateData),
  (req, res, next) => {
      //send CDS data, wrapped in CDS Card, back to EHR client
      res.status(200).json(res.locals.cdsData); 
  }
);

module.exports = router;
