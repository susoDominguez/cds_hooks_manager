var express = require("express");
var router = express.Router();
const { fetchParams, requestCdsServices } = require("../middleware/data-processing-component");
const { getCdsServices, getCdsServicesByCig } = require("../database_modules/service_finders");
const asyncMiddleware = require("../lib/asyncMiddleware");
//const logger = require('../config/winston');

////////////////////////////////////////////////////////////////////////

/* GET cds-services on this server. */
router.get('/', 
      asyncMiddleware(getCdsServices));

/* GET cds-services by CIG model on this server. */
router.get("/cigModel/:cigId", 
      asyncMiddleware(getCdsServicesByCig));

/* POST trigger some hook attached to some CIG authoring tool */
router.post(
  '/:hook/cigModel/:cigId',
  asyncMiddleware(fetchParams),
  asyncMiddleware(requestCdsServices)
);

/* POST trigger some hook attached to some CIG authoring tool */
router.post(
      '/:hook',
      asyncMiddleware(fetchParams),
      asyncMiddleware(requestCdsServices)
    );

module.exports = router;
