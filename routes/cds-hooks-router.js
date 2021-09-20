var express = require("express");
var router = express.Router();
const {
} = process.env;
var { fetchParams } = require("../middleware/data-processing-component");
var { getCdsServices, getCdsServicesByCig } = require("../database_modules/service_finders");


const asyncMiddleware = require("../lib/asyncMiddleware");

////////////////////////////////////////////////////////////////////////

/* GET cds-services on this server. */
router.get('/', 
      asyncMiddleware(getCdsServices));

/* GET cds-services by CIG model on this server. */
router.get("/cigModel/:cigId", 
      asyncMiddleware(getCdsServicesByCig));

/* POST provide personalised care plan with no argumentation */
router.post(
  '/:hook',
  asyncMiddleware(fetchParams),
  //asyncMiddleware(fetchTmrData),
 // asyncMiddleware(aggregateData),
  (req, res, next) => {
      //send CDS data, wrapped in CDS Card, back to EHR client
      res.status(200).json(res.locals.cdsData); 
  }
);

module.exports = router;
