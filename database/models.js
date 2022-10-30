import mongoose from "mongoose";
import { servicesConnection, connectionsList } from "./connections.js";
//import logger from "../config/winston.js";
import { ErrorHandler } from "../lib/errorHandler.js";
import logger from "../config/winston.js";
//this is the subClassOf operator lab.jsel
//import {  } from "./constants.js";
//Define a sche.jsma
const Schema = mongoose.Schema;


//schema for template used as guidance to find, extract and modified FHIR-based data from Cds Hooks
/*
const paramSchema = new mongoose.Schema(
  {
    parameter: { type: String, required: true, maxlength: 100 },
    cigInvolved: {
      type: String,
      required: false,
      default: "",
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
*/

const paramSchema = new mongoose.Schema(
  {
    parameter: { type: String, required: true, maxlength: 100 },
    description: { type: String, required: true, default: "none"},
    cigInvolved: {
      type: [String],
      required: false,
      default: [],
      maxlength: 100,
    },
    //list of objects specifying where to find the data, their type and default values (possibly another Jsonpath) if data not found
    dataPaths: {
      type: [
        {
          label: { type: String, required: true },
          description: { type: String, required: false, default: "none"},
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
          required: { 
            type: Boolean, 
            required: true, 
            default: true 
          },
        },
      ],
      required: true,
      default: [],
    },
    actions: {
      type: [
        {
          action: {
            type: String,
            enum: [
              //arg1 in arg2 List?
              "in",
              //arg2 in arg1 List?
              "inLhs", 
              //unary of binary functions
              "function",
              //compare arg1 and arg2 from pathList
              "comparison",
              //compare arg1 and arg2 where arg2 is a parameter in the outcomelist
              "Qomparison",
              //find references given a list of identifiers
              "findRef",
              //aarg1 list is subset of arg2 list?
              "isSubsetOf",
              //arg2 list is subset of arg1 list?
              "isSubsetOfLhs",
              //arg 1 is subsumed by arg2 - applied as query constraint
              "is_a",
               //arg 1 is subsumes arg2 - applied as query constraint
              "has_a",
              //one arg only
              "parentOf",
              "parentOrSelfOf",
              "childOf",
              "childOrSelfOf",
              "descendantOf",
              "descendantOrSelfOr",
              "ancestorOf",
              "ancestorOrSelfOf"
            ],
            default: "in",
            required: false,
          },
          details: {
            type: {
              //case comparison
              arg1: {
                type: String,
                required: true,
              },
              arg2: {
                type: String,
                required: false
              },
              //case comparison and function symbol
              symbol: {
                type: String,
                required: false,
                //add function symbols here
                //enum: ["eq", "gt", "gte", "lt", "lte", "ne"],
              },
              //case findRef //TODO: review this
              Jpath: { 
                type: String, 
                required: false 
              },
              typeOf: {
                type: String,
                required: false,
                enum: ["boolean", "array", "string", "date", "number"],
                default: "string",
              },
              termSystem: {
                type: String,
                required: false,
                enum: ["SCT", "LOINC", "READ","ICD10"],
              },
              //find concept relations: Terminology system
              codeSystem: {
                type: String,
                required: false
              },
              version: {
                type: String,
                required: false
              },
              filter: {
                type: String,
                required: false
              },
              count: {
                type: Number,
                required: false
              }
            },
          },
        }
      ],
      required: true,
      default: [],
    },
    output: { //field outcome of type array is mandatory
      type: [
        {
        constraintParam: { type: [Schema.Types.Mixed], required: true, default: [] },
        outcome: { type: [Schema.Types.Mixed], required: true, default: [] },
      },
    ],
      required: false,
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
          hook: { type: String, required: true, default: "copd-careplan-review" },
          title: { type: String, required: true },
          description: { type: String, required: true },
          id: { type: String, required: true, default: "copd-careplan-review" },
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
const serviceModel = servicesConnection.model("Cds-Service", cdsServiceSchema, 'cds-services');

/**
 *
 * @param {string} cigId CIG model (possibly null).
 * @param {string} hookId hook id. Also, label of Collection in DB linked to CIG model
 * @returns
 */
function getModelbyCig(cigId, hookId) {

  let Param = undefined;
  //default database name for hooks which require no CIG tools
  let cigTool = cigId ? cigId : "non-cig";
  try {
    Param = connectionsList.get(cigTool).model("Parameter", paramSchema, hookId);
    if (Param === undefined)
      throw new Error(
        "constant CigSelect has not been instantiated with a Model"
      );
  } catch (err) {
    throw new ErrorHandler(500, "getModelbyCig: " + err.message);
  }
  
  return Param;
}

export {
  serviceModel,
  getModelbyCig,
};
