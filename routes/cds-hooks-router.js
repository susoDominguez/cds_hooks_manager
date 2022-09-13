import express from "express";
import dpcPackgDefault from "../middleware/data-processing-component.js";
const { fetchParams, requestCdsServices } = dpcPackgDefault;
import serFindPackgDef from "../database_modules/service_finders.js";
const  { getCdsServices, getCdsServicesByCig } = serFindPackgDef;
import asyncMiddleware from "../lib/asyncMiddleware.js";
var router = express.Router();
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

/* POST trigger some hook non-attached to some CIG authoring tool */
router.post(
      '/:hook',
      asyncMiddleware(fetchParams),
      asyncMiddleware(requestCdsServices)
    );

export  {router};
