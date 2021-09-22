const mongoose = require("mongoose");
const { servicesConnection, connectionsList } = require("./connections");
const logger = require("../config/winston");
const { ErrorHandler } = require("../lib/errorHandler");

const { isAncestor_eq } = require("./constants");
//Define a schema
const Schema = mongoose.Schema;

//schema for template used as guidance to find, extract and modified FHIR-based data from Cds Hooks
const paramSchema = new mongoose.Schema(
  {
    parameter: { type: String, required: true, maxlength: 100 },
    cigInvolved: {
      type: [String],
      required: false,
      default: [],
      maxlength: 100,
    },
    //list of objects specifying where to find the data, their type and default values (possibly another Jsonpath) if data not found
    pathList: {
      type: [
        {
          label: { type: String, required: true },
          Jpath: { type: String, required: true },
          typeOf: {
            type: String,
            required: true,
            enum: ["boolean", "array", "string", "date", "number"],
            default: "string",
          },
          defaultVal: {
            type: Schema.Types.Mixed,
            required: false,
            default: undefined,
          },
          required: { type: Boolean, required: true, default: true },
        },
      ],
      required: true,
      default: [],
    },
    actionList: {
      type: [
        {
          action: {
            type: String,
            enum: [
              "inLHS",
              "function",
              "comparison",
              "inRHS",
              "findRef",
              isAncestor_eq,
            ],
            default: "inLHS",
            required: true,
          },
          details: {
            type: {
              //case function
              function_name: { type: String, required: false },
              //case comparison
              resultArgListIndex: {
                type: Number,
                required: false,
              },
              //case comparison
              compare: {
                type: String,
                required: false,
                enum: ["eq", "gt", "gte", "lt", "lte", "ne"],
              },
              //ALL cases
              pathListIndex: {
                type: [Number],
                required: false,
              },
              //case findRef
              Jpath: { type: String, required: false },
              typeOf: {
                type: String,
                required: false,
                enum: ["boolean", "array", "string", "date", "number"],
                default: "string",
              },
              //find copncept relations: Terminology system
              codeSystem: {
                type: String,
                required: false,
                enum: ["SCT", "LOINC", "READ"],
              },
            },
          },
        },
      ],
      required: true,
      default: [],
    },
    resultList: {
      type: [
        {
          argList: { type: [Schema.Types.Mixed], required: true, default: [] },
          outcome: { type: [Schema.Types.Mixed], required: true, default: [] },
        },
      ],
      required: true,
      default: [],
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

///SCHEMA FOR STRUCTURAL TEMPLATES

//
const templateSchema = new Schema(
  {
    //name of this template
    label: { type: String, required: true, maxlength: 100 },
    //paths to properties in 'body' to be updated with given data as part of the algorithm
    add: {
      type: [
        {
          parameter: { type: String },
          fields: { type: [{ path: { type: String } }] },
          entryObject_property: { type: String },
          entryObject: { type: Schema.Types.Mixed },
        },
      ],
      required: true,
    },
    body: { type: Schema.Types.Mixed, required: true },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

//

const cdsServiceSchema = new mongoose.Schema(
  {
    cigModel: { type: String, required: true, default: "tmr" },
    services: {
      type: [
        {
          hook: { type: String, required: true, default: "careplan-review" },
          title: { type: String, required: true },
          description: { type: String, required: true },
          id: { type: String, required: true, default: "careplan-review" },
          prefetch: { type: Schema.Types.Mixed, required: false },
        },
      ],
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

//cds services model
const serviceModel = servicesConnection.model("Cds-Service", cdsServiceSchema);

/**
 *
 * @param {string} cigId CIG model.
 * @param {string} hookId label of hook. Also, label of Collection in DB linked to CIG model
 * @returns
 */
function getModelbyCig(cigId, hookId) {

  let Param = undefined;
  try {
    Param = connectionsList.get(cigId).model("Parameter", paramSchema, hookId);
    if (Param === undefined)
      throw new Error(
        "constant CigSelect has not been instantiated with a Model"
      );
  } catch (err) {
    throw new ErrorHandler(500, "getModelbyCig: " + err.message);
  }
  return Param;
}

module.exports = {
  serviceModel,
  getModelbyCig,
};
