import browser from 'webextension-polyfill'
import Alpine from 'alpinejs';
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/elegant.css'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/edit/closebrackets'
import 'regenerator-runtime/runtime.js';
import PouchDB from "pouchdb";
import jsonld from 'jsonld';


var code_mirror = null;

const schema_org_http_match = /^http:\/\/schema\.org\//gi;
const schema_org_https_match = /^https:\/\/schema\.org\//gi;

const ds_frame = {
  "@context":{
    "@vocab":"https://schema.org/"
  },
  "@type":["Dataset"],
  "name":{},
  "description":{},
  "url":{},
  "identifier":{}
};

/*
List of one per block:
{
  text: text source
  parsed: parsed data block
  framed: framed parsed data block
  report: validation report
  report_framed: validation report framed
}
 */

class DataBlock{
  constructor(text) {
    this.text = text;
    this.data = null;
    this.expanded = null;
    this.framed = null;
    this._namespace = null;
    this._editor = null;
  }

  async parse() {
    if (this.text === null) {
      return null;
    }
    return new Promise(resolve =>{
      try {
        this.data = JSON.parse(this.text);
        resolve(this.data);
      } catch(e) {
        this.data = null;
        resolve(this.data);
      }
    });
  }

  async getNamespace(){
    if (this._namespace !== null) {
      return this._namespace;
    }
    if (!this.expanded) {
      await this.expand();
    }
    this._namespace = "";
    for (let ig=0; ig<this.expanded.length; ig++){
      for (let k in this.expanded[ig]) {
        if (this.expanded[ig].hasOwnProperty(k)) {
          console.debug("K = ",k);
          if (k.match(schema_org_http_match)) {
            this._namespace = "http://schema.org/";
            return this._namespace;
          }
          if (k.match(schema_org_https_match)) {
            this._namespace = "https//schema.org/";
            return this._namespace;
          }
        }
      }
    }
    return this._namespace;
  }

  async expand() {
    if (!this.data) {
      console.error("No parsed data available to expand");
      return null;
    }
    this.expanded = await jsonld.expand(this.data);
    return this.expanded;
  }

  async frame(json_frame) {
    if (!this.data) {
      console.error("No parsed data available to frame");
      return null
    }
    if (this._namespace === 'http://schema.org/') {
        json_frame['@context']['@vocab'] = 'http://schema.org/';
      }
    this.framed = await jsonld.frame(this.data, json_frame, {omitGraph:false});
    return this.framed;
  }

  getName() {
    //TODO: a graph may have more than one dataset
    try {
      return this.framed["@graph"][0].name;
    } catch(e) {
      console.error(e);
      console.error("Problem getting name for ", this);
    }
    return "Not Available";
  }

  getDescription() {
    try {
      return this.framed["@graph"][0].description;
    } catch(e) {
      console.error(e);
      console.error("Problem getting description for ", this);
    }
    return "Description Not Available";
  }

  async validate(shape_graph) {
  }

  updateAfterEdit() {

  }

  getEditor(ele) {
    if (this.editor !== null){
      return this.editor;
    }
    this.editor = CodeMirror.fromTextArea(
      ele,{
        matchBrackets: true,
        autoCloseBrackets: true,
        mode: 'application/ld+json',
        lineNumbers: true,
        lineWrapping: true
      });
    return this.editor;
  }
}

var page_data_blocks = {
  _dummy: 0,
  baseURI:null,
  blocks:[],
  dataSets() {
    return this.blocks;
  },
  async frameAll(data_frame, cb) {
    let promises = [];
    for (let i=0; i<this.blocks.length; i++){
      await this.blocks[i].getNamespace();
      promises.push(this.blocks[i].frame(data_frame));
    }
    Promise.all(promises).then(cb);
  }
};
window.page_data_blocks = page_data_blocks;

function updateUI(){
  var ele = document.getElementById('dataset_view');
  ele.__x.$data._dummy += 1;
}

var page_data = {
  baseURI:null,
  text:[],
  parsed: [],
  is_https: [],
  types: [],
  framed: [],
  reports:[],
  reports_framed:[],
};
window.page_data = page_data;

async function validateJsonLD(jsonld_txt) {
  let db = new PouchDB('tangram');
  let config = await(db.get('tangram_config'));

  console.log("Service URL= " + config.service_url)
  const url = config.service_url
  // create form data for sending MIME/multipart
  let formdata = new FormData()
  const response_format = config.report_format;
  formdata.append("fmt",response_format);
  formdata.append("infer", false)
  // set the datagraph
  console.log("DATA: " + jsonld_txt)
  let dg = new Blob([jsonld_txt], {type:"application/ld+json"})
  console.log("data blob created")
  formdata.append("dg", dg)
  // set the shapegraph
  let sg = await db.getAttachment('tangram_config','shacl.ttl')
  console.log("shape blob created")
  formdata.append("sg", sg)
  // http request for posting to validatio nservice
  let request = new XMLHttpRequest()
  request.onreadystatechange = async function() {
    document.getElementById("v_status").innerText = this.readyState.toString()
    if (this.readyState === 4 && this.status === 200) {
      console.log(this.responseText);
      document.getElementById("v_status").innerText = this.status.toString()
      if (response_format === 'json-ld') {
        let json_obj = JSON.parse(this.responseText);
        const ftext = await jsonld.frame(json_obj, jld_frame);
        console.log("FRAMED: ", ftext);
        document.getElementById("validation_result").innerText = JSON.stringify(ftext, undefined, 2)
      } else {
        document.getElementById("validation_result").innerText = this.responseText;
      }
      document.getElementById('bt_validate').disabled = false;
    }
  }
  request.open("POST", url, true)
  request.send(formdata)
}


async function doValidation() {
  document.getElementById("validation_result").innerText = "Working..."
  var jsonld_text = code_mirror.getDoc().getValue();
  console.log("JSONLD=" + jsonld_text)
  await validateJsonLD(jsonld_text)
}


function setJsonLD(url, jsonld) {
  // Set the json-ld content and request validation
  document.getElementById("v_status").innerText = "Loading"
  document.getElementById("validation_result").innerText = ""
  document.getElementById('bt_validate').style.display = "block";
  document.getElementById('src_edit').style.display = "block";
  document.getElementById('bt_validate').disabled = true;
  document.getElementById('v_url').innerText = url;
  let jsonld_text = null;
  if (jsonld.length > 0) {
    jsonld_text = jsonld[0]  //TODO - multiple json-ld in the document?
    if (jsonld.length > 1) {
      console.log("Warning: More than one json-ld block found.")
      document.getElementById('v_note').innerText = 'Warning: More than one json-ld block found.';
    }
  } else {
    //No json-ld available
    console.log("No json-ld found.")
    document.getElementById("v_status").innerText = "Failed"
    document.getElementById("validation_result").innerText = "No JSON-LD found on page."
    document.getElementById('bt_validate').style.display = "none";
    document.getElementById('src_edit').style.display = "none";
    return
  }
  if (jsonld_text === null) {
    return;
  }
  if (code_mirror === null) {
    code_mirror = CodeMirror.fromTextArea(document.getElementById('jsonld_text'), {
      matchBrackets: true,
      autoCloseBrackets: true,
      mode: 'application/ld+json',
      lineNumbers: true,
      lineWrapping: true
    });
  }
  try {
    let json_obj = JSON.parse(jsonld_text);
    code_mirror.getDoc().setValue(JSON.stringify(json_obj, undefined, 2))
  } catch(err) {
    document.getElementById("v_status").innerText = "Failed"
    document.getElementById("validation_result").innerText = "JSON-lD is invalid. Try again after editing. \n" +err
    code_mirror.getDoc().setValue(jsonld_text);
    let bt_validate = document.getElementById('bt_validate');
    bt_validate.onclick = doValidation;
    return;
  }
  try {
    document.getElementById("validation_result").innerText = "Working..."
    validateJsonLD(jsonld_text);
  } catch(err) {
    console.log("Error validating json-ld. ERROR: "+err)
    document.getElementById("validation_result").innerText = "Error validating:\n" + err
  }
  let bt_validate = document.getElementById('bt_validate');
  bt_validate.onclick = doValidation;
}

async function detectNamespace(data) {
  console.log("detectNamespace 1");
  let edata = await jsonld.expand(data);
  let ns = '';
  console.log("detectNamespace 2");
  for (let ig=0; ig<edata.length; ig++){
    for (let k in edata[ig]) {
      if (edata[ig].hasOwnProperty(k)) {
        console.debug("K = ",k);
        if (k.match(schema_org_http_match)) {
          return "http://schema.org/";
        }
        if (k.match(schema_org_https_match)) {
          return "https//schema.org/";
        }
      }
    }
  }
  return ns;
}

async function parseData(text){
  return new Promise(resolve =>{
    try {
      let parsed = JSON.parse(text);
      resolve(parsed);
    } catch(e) {
      resolve(null);
    }
  });
}

async function parsePageData(){
  let promises = [];
  for (let ib=0; ib < page_data.text.length; ib++){
    promises.push(parseData(page_data.text[ib]));
  }
  page_data.parsed = await Promise.all(promises);
}

async function framePageData(){
  //Assumes page_data has been populated.
  console.debug("page data: ", page_data);
  let promises = [];
  for (let ib=0; ib<page_data.parsed.length; ib++){
    if (page_data.parsed[ib]) {
      console.debug("Framing: ", page_data.parsed[ib]);
      let d_frame = ds_frame;
      if (!page_data.is_https[ib]) {
        d_frame['@context']['@vocab'] = 'http://schema.org/';
      }
      promises.push(jsonld.frame(page_data.parsed[ib], d_frame, {omitGraph:false}));
    } else {
      console.debug("Skip framing for: ", page_data.parsed[ib]);
      promises.push({})
    }
  }
  const results = await Promise.all(promises);
  for (let ib=0; ib < results.length; ib ++){
    page_data.framed[ib] = results[ib];
  }
  console.info("Framing completed: ",page_data.framed);
}

window.onload = async function() {

  // Listen for message to update the json_ld for validation
  browser.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log("editor.js onMessage: ", request);
  });

  // Notify backend that the editor window is ready
  browser.runtime.sendMessage({
    name:'tangram_popup_ready'
  });

  // Notify content that we're ready
  browser.tabs.query({active:true, currentWindow:true}).then(function(tabs){
    Alpine.start();
    browser.tabs.sendMessage(tabs[0].id, {name:'get_json'}).then(function(response){
      console.log("Response to popup from tab get_json: ", response);
      page_data_blocks.baseURI = response.baseURI;

      let promises = [];
      for (let ib=0; ib < response.blocks.length; ib++){
        let block = new DataBlock(response.blocks[ib].text);
        page_data_blocks.blocks.push(block);
        promises.push(block.parse());
      }
      Promise.all(promises).then(function(){
        console.log("Loaded data:", page_data_blocks);
        page_data_blocks.frameAll(ds_frame, updateUI);
        console.log("Data framed");
      })
      /*
      page_data.baseURI = response.baseURI;
      for (let ib=0; ib < response.blocks.length; ib++){
        page_data.text.push(response.blocks[ib].text);
        page_data.parsed.push(response.blocks[ib].parsed);
        page_data.types.push(response.blocks[ib].types);
        page_data.framed.push(null);
        page_data.reports.push(null);
        page_data.reports_framed.push(null);
        let is_https = true;
        for (let tt in page_data.types[ib]) {
          if (page_data.types[ib].hasOwnProperty(tt)){
            console.debug('type = ',tt);
            if (tt.match(schema_org_http_match)){
              is_https = false;
              break;
            }
          }
        }
        page_data.is_https.push(is_https);
        detectNamespace(page_data.parsed[ib]).then(function(res){
          console.log("detected namespace = ", res);
        });
      }
      setTimeout(framePageData, 10);

       */
    });
  });
};

