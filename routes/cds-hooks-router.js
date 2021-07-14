var express = require("express");
var router = express.Router();
const {
} = process.env;
var { fetchParams, getCdsServices } = require("../middleware/data-processing-component");


const asyncMiddleware = require("../lib/asyncMiddleware");

////////////////////////////////////////////////////////////////////////

/* GET cds-services on this server. */
router.get("/cigModel/:cigId", 
      asyncMiddleware(getCdsServices)
      );

/* POST provide personalised care plan with no argumentation */
router.post(
  '/:hook/cigModel/:cigId',
  asyncMiddleware(fetchParams),
  //asyncMiddleware(fetchTmrData),
 // asyncMiddleware(aggregateData),
  (req, res, next) => {
      //send CDS data, wrapped in CDS Card, back to EHR client
      res.status(200).json(res.locals.cdsData); 
  }
);

module.exports = router;
