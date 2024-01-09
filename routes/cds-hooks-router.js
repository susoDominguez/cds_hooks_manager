import express from "express";
import dpcPackgDefault from "../middleware/data-processing-component.js";
const { fetchParams, requestCdsService } = dpcPackgDefault;
import serFindPackgDef from "../database/service_finders.js";
const  { getCdsServices, getCdsServicesByCig } = serFindPackgDef;
import asyncMiddleware from "../lib/asyncMiddleware.js";
var router = express.Router();
//const logger = require('../config/winston');

////////////////////////////////////////////////////////////////////////

/* GET cds-services on this server. */
router.get('/', 
      asyncMiddleware(getCdsServices));

/* GET cds-services by CIG model on this server. */
router.get("/gms/:gms_id", 
      asyncMiddleware(getCdsServicesByCig));

/* POST trigger some hook attached to some CIG authoring tool */
router.post(
  '/:service_id/gms/:gms_id',
  asyncMiddleware(fetchParams),
  asyncMiddleware(requestCdsService)
);

/* POST trigger some hook attached to some CIG authoring tool using a particular FHIR profile for modelling the CDS response */
router.post(
      '/:service_id/gms/:gms_id/profile/:profile_id',
      asyncMiddleware(fetchParams),
      asyncMiddleware(requestCdsService)
    );

/* POST trigger some hook non-attached to some CIG authoring tool */
router.post(
      '/:service_id',
      asyncMiddleware(fetchParams),
      asyncMiddleware(requestCdsService)
    );

export  {router};
