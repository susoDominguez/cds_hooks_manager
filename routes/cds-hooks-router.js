var express = require("express");
var router = express.Router();
const {
} = process.env;
const { fetchParams } = require("../middleware/data-processing-component");
const { isAncestorEq } = require("../middleware/data-processing-module");
const { getCdsServices, getCdsServicesByCig } = require("../database_modules/service_finders");
const asyncMiddleware = require("../lib/asyncMiddleware");
const logger = require('../config/winston');

////////////////////////////////////////////////////////////////////////

/* GET cds-services on this server. */
router.get('/', 
      asyncMiddleware(getCdsServices));

/* GET cds-services by CIG model on this server. */
router.get("/cigModel/:cigId", 
      asyncMiddleware(getCdsServicesByCig));

/* POST provide personalised care plan with no argumentation */
router.post(
  '/:hook/cigModel/:cigId',
  asyncMiddleware(fetchParams),
  //send CDS data, wrapped in CDS Card, back to EHR client
     //res.status(200).json(result)
);

module.exports = router;
