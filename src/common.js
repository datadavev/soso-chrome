import jsonld from "jsonld";

const SCHEMA_ORG_CONTEXT_DOC = "https://schema.org/version/latest/schema.jsonld";
const NS_SCHEMA_ORG = 'http://schema.org/';
const RDF_TYPE='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const schema_org_any_match = /^http(s?):\/\/schema\.org/gi;
const schema_org_http_match = /^http:\/\/schema\.org/gi;

//Types that match these will trigger SHACL validation
const validation_types = [
  'Dataset',
  'https://schema.org/Dataset',
  'http://schema.orgDataset',
  'https://schema.orgDataset'
];

/*
 Context that imports the schema.org class relationships
 and sets the default vocabulary.
*/
const schema_org_compact = {
  "@context":[
    SCHEMA_ORG_CONTEXT_DOC,
    {
      "@vocab": NS_SCHEMA_ORG
    }
  ]
};

/*
 Generic schema.org frame, can apply to any type
*/
const generic_frame = {
  "@context":{
    "@vocab": NS_SCHEMA_ORG
  },
  "@type":{},
  "name":{},
  "@embed": true
};

/*
 Frame to apply to Datasets for generic representation
 */
const dataset_frame = {
  "@context":{
    "@vocab": NS_SCHEMA_ORG
  },
  "@type":["Dataset"],
  "name":{},
  "description":{},
  "identifier":{},
  "spatialCoverage":{},
  "temporalCoverage":{},
  "@explicit": true
};

const validation_report_frame = {
  "@context": {
    "sh": "http://www.w3.org/ns/shacl#",
    "SO":"http://schema.org/"
  },
  "@type":"sh:ValidationReport",
  "sh:conforms":{},
  "sh:failureCount":0,
  "sh:shapeCount":0,
  "sh:shapesApplied":0,
  "sh:result":{
    "@type":"sh:ValidationResult",
    "sh:resultSeverity":{},
    "sh:resultMessage":{"@value":{},"@language":"en"},
    "sh:focusNode":{}
  }
};

/*++++++++++++++++++++++++++++
 * Custom loader for avoiding content load over different protocols
 */
// grab the built-in jsonld doc loader
const nodeDocumentLoader = jsonld.documentLoaders.xhr();

// change the default document loader for the json-ld loader,
// but only for http requests to schema.org. This is (was?) necessary
// to avoid CORs issues due to apparent mis-config on their server
const customLoader = async (url, options) => {
  console.debug("SOSO.content: customLoader url:", url);
  if (url.match(schema_org_any_match)) {
    if (url.match(schema_org_http_match)) {
      url = url.replace('http://', 'https://');
    }
  }
  return nodeDocumentLoader(url);
};
jsonld.documentLoader = customLoader;
/* -------------------------------- */


function getPropVal(o, prop, default_val=null) {
  try {
    return o[prop]
  } catch(e) {
    // pass
  }
  return default_val;
}

function getNIVI(o) {
  return getPropVal(o, "name")
    || getPropVal(o,"identifier")
    || getPropVal(t, "headline") 
    || getPropVal(o,"@value")
    || getPropVal(o,"@id")
    || "";
}

function elementVal(o) {
  let tof = typeof o;
  if (tof === "string"){
    return o;
  }
  if (tof === "number"){
    return o;
  }
  return getNIVI(o);
}

export default class JsonLdBlock {
  constructor(text, global_block_id) {
    if (typeof(text) == "object") {
      Object.assign(this, text);
    } else {
      this.original_source = text;
      this.global_block_id = global_block_id;
      this.data = null;
      this.compact = null;
      this._parse_error = null;
      this._text = this.original_source;
      this._parsed = false;
      this._validated = false;
      this._validation_report = null;
      this._validation_framed = null;
      this._generic_framed = null;
      this._types = null;
      this.validation = false;
      this.valid = -1;
    }
  }

  update(b) {
    this._validated = b._validated;
    this._validation_report = b._validation_report;
    this._validation_framed = b._validation_framed;
    this.valid = b.valid;
  }

  async _parse(context) {
    if (context == null) {
      context = schema_org_compact
    }
    try {
      this.data = JSON.parse(this._text);
    } catch (e) {
      console.error("Could not parse JSON-LD block: ",e);
      this._parse_error = e;
      this.validation = false;
      this._parsed = false;
      return;
    }
    this.compact = await jsonld.compact(this.data, context, {graph:true});
    this._dataset_framed = await jsonld.frame(this.data, dataset_frame,  {omitGraph:false});
    this._generic_framed = await jsonld.frame(this.data, generic_frame,  {omitGraph:false});
    let self = this;
    this.compact["@graph"].forEach(function(t) {
      if (validation_types.includes(t["@type"])) {
        self.validation = true;
      }
    });
    this._parsed = true;
  }

  async setText(txt) {
    this._parsed = false;
    this._text = txt;
    this._parse();
  }

  get validationReport() {
    if (this._validation_framed !== null) {
      return JSON.stringify(this._validation_framed, null, 2);
    }
    if (this._validation_report !== null) {
      return JSON.stringify(this._validation_report, null, 2);
    }
    return "No validation report available.";
  }

  get dataText() {
    if (this._parse_error !== null) {
      return this._text;
    }
    return JSON.stringify(this.data, null,2);
  }

  get compactText() {
    if (this._parse_error !== null) {
      return this._text;
    }
    return JSON.stringify(this.compact, null, 2);
  }

  get datasetText() {
    if (this._parse_error !== null) {
      return this._text;
    }
    return JSON.stringify(this._dataset_framed, null, 2);
  }

  get numDatasets() {
    if (this._parse_error !== null) {
      return 0;
    }
    return this._dataset_framed["@graph"].length;
  }

  get genericFrame() {
    if (this._parse_error !== null) {
      return this._text;
    }
    return JSON.stringify(this._generic_framed, null, 2);
  }

  get basicInfo() {
    // Retrieve a list of types of top level items
    let res = [];
    if (this._parse_error !== null) {
      res.push({
        type:"Error",
        name: this._parse_error.name || "Error",
        description: this._parse_error.message
      });
      return res;
    }
    this.compact["@graph"].forEach(function(t){
      let oname = getNIVI(t) || elementVal(t["url"]) || "";
      let v = {
        type:t["@type"],
        name:oname,
        description:getPropVal(t, "description") || ""
      };
      res.push(v);
    });
    return res;
  }

  processValidation(done_callback) {
    let self = this;
    jsonld.frame(this._validation_report, validation_report_frame,  {omitGraph:true})
      .then(result => {
        console.debug("framed validation = ", result);
        self._validation_framed = result;
        if (self._validation_framed['sh:failureCount'] === 0) {
          self.valid = 1;
        } else {
          self.valid = 0;
        }
        self._validated = true;
        if (done_callback !== null) {
          done_callback(self);
        }
    });
  }

  validate(service_url, shape_source, options, done_callback) {
    let formdata = new FormData();
    formdata.append("fmt",'json-ld');
    formdata.append("infer", options.infer || false);
    let dg = new Blob([this.dataText], {type:"application/ld+json"});
    formdata.append("dg", dg);
    let sg = new Blob([shape_source], {type:"application/turtle"});
    formdata.append("sg", sg);
    let request = new XMLHttpRequest();
    let self = this;
    request.onreadystatechange = function() {
      if (this.readyState === 4 && this.status === 200) {
        self._validation_report = JSON.parse(this.responseText);
        self.processValidation(done_callback);
      }
    };
    request.open("POST", service_url, true);
    request.send(formdata)
  }
}
