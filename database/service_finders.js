import { serviceModel } from "./models.js";
//const  = modPckgDef;
//const { servicesConnection, tmrConnection } = require("./connections");
import { ErrorHandler } from "../lib/errorHandler.js";

export default {
  /**
   * returns all CDS services available for a particular computer-interpretable execution engine.
   * @param {JSON} req request
   * @param {JSON} res response
   * @param {Callback} next callback
   */
  getCdsServicesByCig: async function (req, res, next) {
    const cigID = req.params.cigId;
    //params holds the captured values in the route path
    //find document by its cigId as stated in req.params
    await serviceModel
      .findOne({ cigModel: cigID })
      .select({ services: true, _id: false })
      .exec()
      .then((services) => {
        res.status(200).json(services["services"]);
      })
      .catch((err) => {
        next(
          new ErrorHandler(
            err.status || 500,
            "error when attempting to retrieve cds-services for cigId: " +
              (typeof cigID === undefined
                ? cigID
                : "-null or non-existent cigId-") +
              ". " +
              err.stack
          )
        );
      });
  },
  /**
   * returns all CDS services availables.
   * @param {JSON} req request
   * @param {JSON} res response
   * @param {function} next callback
   */
  getCdsServices: async function (req, res, next) {
    //Array to concat services extracted
    let servicesArray = new Array();
    //counter of cig models
    let cigModelCounter = 0;

    //get cursor Promise to all parameters from this request
    for await (const doc of serviceModel.find().lean()) {
      //key of Map
      let services = doc.hasOwnProperty("services")
        ? doc["services"]
        : undefined;

      if (services === undefined)
        throw new ErrorHandler(
          500,
          `Parameter label 'services' is missing from CDS Services document`
        );

      if (cigModelCounter++ === 0) {
        servicesArray = services;
      } else {
        services.forEach((element) => {
          servicesArray.push(element);
        });
      }
    }
    res.status(200).json(servicesArray);
  },
};
