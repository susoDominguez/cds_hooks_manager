const { serviceModel } = require("./models");
//const { servicesConnection, tmrConnection } = require("./connections");
const { ErrorHandler } = require("../lib/errorHandler");

module.exports = {

  getCdsServicesByCig: async function (req, res, next) {
    //params holds the captured values in the route path
    //find document by its cigId as stated in req.params
    await serviceModel
      .findOne({ cigModel: req.params.cigId })
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
              (req.param.cigId
                ? req.param.cigId
                : "-null or non-existent cigId-") +
              ". " +
              err.stack
          )
        );
      });
  },
  getCdsServices: async function (req, res, next) {

    //Array to concat services extracted
    let servicesArray = new Array();
    //counter of cig models
    let cigModelCounter = 0;
    
    //get cursor Promise to all parameters from this request
  for await (const doc of serviceModel.find().lean()) {
    //key of Map
    let services = doc.hasOwnProperty('services') ? doc['services'] : undefined;

    if (services === undefined)
      throw new ErrorHandler(500,`Parameter label services is missing from template`);

      if(cigModelCounter++===0){
        servicesArray = services;
      } else {
        services.forEach(element => {
          servicesArray.push(element);
        });
      }
  }
  res.status(200).json(servicesArray);
}
   
};
