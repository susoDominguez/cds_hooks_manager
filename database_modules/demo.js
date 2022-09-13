//schema for template used as guidance to find, extract and modified FHIR-based data from Cds Hooks
const paramSchema = new Schema({
    parameter: { type: String, required: true, maxlength: 100 },
    cigInvolved: { type: [String], required: true, default: [], maxlength: 100 },
    description: {
      type: String,
      required: true,
      default: "none",
      maxlength: 100,
    },
    //list of objects specifying where to find the data, their type and default values (possibly another Jsonpath) if data not found
    dataPaths: {
      type: [
        {
          label: { type: String, required: true },
          Jpath: { type: String, required: true },
          description: { type: String, required: false },
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
          _id: false
        },
      ],
      _id: false,
      required: true,
      default: [],
    },
    actions: {
      type: [
        {
          action: {
            type: String,
            enum: [
              "inLHS",
              "in",
              "function",
              "comparison",
              "Qomparison",
              "findRef",
              "subSetOf",
              "subSetOfLHS",
              "subClassOf",
            ],
            _id: false,
            default: "in",
            required: true,
          },
          details: {
            type: {
              //case ALL
              arg1: {
                type: String,
                required: true,
              },
              //ALL cases
              arg2: {
                type: Schema.Types.Mixed,
                required: false,
              },
              //case comparison, Qomparison, function, subsetOf, subClassOf
              symbol: {
                type: String,
                required: false
              },
              //case subClassOf
              codeSystemId: { type: String, required: false, enum: ["SNOMEDCT"] },
              //case findRef
              Jpath: { type: String, required: false },
              typeOf: {
                type: String,
                required: false,
                enum: ["boolean", "array", "string", "date", "number"]
              },
            },
            _id: false
          },
        },
      ],
      _id: false,
      required: true,
      default: [],
    },
    output: {
      type: [
        {
          queryArgs: { type: Schema.Types.Mixed },
          outcome: Array,
        },
      ],
      _id: false,
      required: true,
      default: [],
    },
  },{ versionKey: false });