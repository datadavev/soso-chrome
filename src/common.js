import jsonld from "jsonld";

const NS_SCHEMA_ORG = 'http://schema.org/';
const RDF_TYPE='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const schema_org_any_match = /^http(s?):\/\/schema\.org/gi;
const schema_org_http_match = /^http:\/\/schema\.org/gi;

const schema_org_compact = {
  "@context":{
    "@vocab": NS_SCHEMA_ORG
  }
};

const generic_frame = {
  "@context":{
    "@vocab": NS_SCHEMA_ORG
  },
  "@type":{},
  "name":{},
  "@embed": true
};

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


/*++++++++++++++++++++++++++++
 * Custom loader for avoiding content load over different protocols
 */
// grab the built-in jsonld doc loader
const nodeDocumentLoader = jsonld.documentLoaders.xhr();

// change the default document loader,
// but only for http requests to schema.org to avoid CORs issues
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


function elementVal(o) {
  let tof = typeof o;
  if (tof === "string"){
    return o;
  }
  if (tof === "number"){
    return o;
  }
  return o["name"] || o["identifier"] || o["@value"] || o["@id"] || "";
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
      this._text = this.original_source;
      this._parsed = false;
      this._validated = false;
      this._validation_report = null;
      this._generic_framed = null;
    }
  }

  async _parse(context) {
    if (context == null) {
      context = schema_org_compact
    }
    this.data = JSON.parse(this._text);
    this.compact = await jsonld.compact(this.data, context, {graph:true});
    this._dataset_framed = await jsonld.frame(this.data, dataset_frame,  {omitGraph:false});
    this._generic_framed = await jsonld.frame(this.data, generic_frame,  {omitGraph:false});
    this._parsed = true;
  }

  async setText(txt) {
    this._parsed = false;
    this._text = txt;
    this._parse();
  }

  get dataText() {
    return JSON.stringify(this.data, null,2);
  }

  get compactText() {
    return JSON.stringify(this.compact, null, 2);
  }

  get datasetText() {
    return JSON.stringify(this._dataset_framed, null, 2);
  }

  get numDatasets() {
    return this._dataset_framed["@graph"].length;
  }

  get genericFrame() {
    return JSON.stringify(this._generic_framed, null, 2);
  }


  get basicInfo() {
    // Retrieve a list of types of top level items
    let res = [];
    this.compact["@graph"].forEach(function(t){
      let oname = t["name"] || t["identifier"] || t["@id"] || elementVal(t["url"]) || "";
      let v = {
        type:t["@type"],
        name:oname,
        description:t["description"] || ""
      };
      res.push(v);
    });
    return res;

    if ("@graph" in this.compact) {
      this.compact["@graph"].forEach(function(t){
        let v = {
          type:t["@type"],
          name:t["name"] || ""
        };
        res.push(v);
      });
      return res;
    }
    res.push({
      type:this.compact["@type"],
      name:this.compact.name || ""
    });
    return res;
  }

  validate(service_url, shape_source, options, done_callback) {
    let formdata = new FormData();
    formdata.append("fmt",'json-ld');
    formdata.append("infer", options.infer || false);
    let dg = new Blob([this.dataText], {type:"application/ld+json"});
    formdata.append("dg", dg);
    let sg = new Blob([shape_source], {type:"application/turtle"});
    formdata.append("sg", sg);
    let request = new XMLHttpRequest()
    let self = this;
    request.onreadystatechange = function() {
      //document.getElementById("v_status").innerText = this.readyState.toString()
      if (this.readyState === 4 && this.status === 200) {
        console.log(this.responseText);
        //document.getElementById("v_status").innerText = this.status.toString()
        self._validation_report = JSON.parse(this.responseText);
        self._validated = true;
        if (done_callback !== null) {
          done_callback(self);
        }
      }
    };
    request.open("POST", service_url, true);
    request.send(formdata)
  }
}
