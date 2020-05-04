import browser from 'webextension-polyfill'
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/elegant.css'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/edit/closebrackets'
import PouchDB from "pouchdb";
import jsonld from 'jsonld';

var code_mirror = null;
const jld_frame = {};

console.log("jsonld frame: ", jsonld.frame);

async function validateJsonLD(jsonld_txt) {
  let db = new PouchDB('tangram')
  let config = await(db.get('tangram_config'))

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


window.onload = async function() {

  // Listen for message to update the json_ld for validation
  browser.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.operation === 'set_jsonld')
      setJsonLD(request.url, request.jsonld);
      sendResponse({
        status: 'OK'
      });
  });

  // Notify backend that the editor window is ready
  browser.runtime.sendMessage({
    operation:'tangram_ready'
  })
}

