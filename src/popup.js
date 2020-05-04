import browser from 'webextension-polyfill'
//import JSONFormatter from 'json-formatter-js'
import PouchDB from 'pouchdb'
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/elegant.css'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/edit/closebrackets'

//https://www.npmjs.com/package/webextension-polyfill

let the_data = {
    "jsonld_text": "json goes here",
    "url":"url goes here",
    "title":"empty"
  }

var render_event = new Event("render_jsonld")
var formatter = null
var code_mirror = null



async function validateJsonLD(jsonld) {
  let db = new PouchDB('tangram')
  let config = await(db.get('tangram_config'))


  //let _background = browser.extension.getBackgroundPage()
  //let config = _background.getTangramConfig()
  console.log("Service URL= " + config.service_url)
  const url = config.service_url
  // create form data for sending MIME/multipart
  let formdata = new FormData()
  formdata.append("fmt","human")
  formdata.append("infer", false)
  // set the datagraph
  console.log("DATA: " + jsonld)
  let dg = new Blob([jsonld], {type:"application/ld+json"})
  console.log("data blob created")
  formdata.append("dg", dg)
  // set the shapegraph
  //let sg = _background.getShaclShape()
  let sg = await db.getAttachment('tangram_config','shacl.ttl')
  console.log("shape blob created")
  formdata.append("sg", sg)
  // http request for posting to validatio nservice
  let request = new XMLHttpRequest()
  request.onreadystatechange = function() {
    document.getElementById("v_status").innerText = this.readyState.toString()
    if (this.readyState === 4 && this.status === 200) {
      console.log(this.responseText);
      document.getElementById("v_status").innerText = this.status.toString()
      document.getElementById("validation_result").innerText = this.responseText
      document.getElementById('bt_validate').disabled = false;
    }
  }
  request.open("POST", url, true)
  request.send(formdata)
}


async function doValidation() {
  document.getElementById("validation_result").innerText = "Working..."
  the_data.jsonld_text = code_mirror.getDoc().getValue()
  console.log("JSONLD=" + the_data.jsonld_text)
  await validateJsonLD(the_data.jsonld_text)
}

function onJsonLdEditorCreated(win_info) {
  console.log(win_info);
}

function onJsonLdEditorError(error) {
  console.log('onJsonLdEditorError: ${error}')
}

function openJsonLD() {
  // Creates a new window and opens the json-ld in the window
  browser.windows.create({
    url: browser.runtime.getURL("editor.html")
  }).then(onJsonLdEditorCreated, onJsonLdEditorError)
}


browser.tabs.query({active:true, currentWindow:true}).then(async function(tabs) {
  console.log("tabs = " + tabs)
  //request the json-ld from the content script
  document.getElementById('bt_validate').disabled = true;
  let response = await browser.tabs.sendMessage(tabs[0].id, {operation:'get_jsonld'})
  console.log("sendMessage response = " + response.url)
  the_data.url = response.url
  document.getElementById("v_url").innerText = the_data.url
  if (response.jsonld.length > 0){
    the_data.jsonld_text = response.jsonld[0]  //TODO - multiple json-ld in the document?
    if (response.jsonld.length > 0) {
      console.log("Warning: More than one json-ld block found.")
    }
    document.getElementById('bt_open_jsonld').disabled = false;
  } else {
    console.log("No json-ld found.")
    document.getElementById("v_status").innerText = "Failed"
    document.getElementById("validation_result").innerText = "No JSON-LD found on page."
    document.getElementById('bt_validate').style.display = "none";
    document.getElementById('src_edit').style.display = "none";
    return
  }
  code_mirror = CodeMirror.fromTextArea(document.getElementById('jsonld_text'), {
    matchBrackets: true,
    autoCloseBrackets: true,
    mode: 'application/ld+json',
    lineNumbers:true
  })
  try {
    let json_obj = JSON.parse(the_data.jsonld_text)
    code_mirror.getDoc().setValue(JSON.stringify(json_obj, undefined, 2))
  } catch(err) {
    document.getElementById("v_status").innerText = "Failed"
    document.getElementById("validation_result").innerText = "JSON-lD is invalid. Try again after editing. \n" +err
    code_mirror.getDoc().setValue(the_data.jsonld_text)
  }
  try {
    document.getElementById("validation_result").innerText = "Working..."
    validateJsonLD(the_data.jsonld_text);
  } catch(err) {
    console.log("Error validating json-ld. ERROR: "+err)
    document.getElementById("validation_result").innerText = "Error validating:\n" + err
  }
  let bt_validate = document.getElementById('bt_validate');
  bt_validate.onclick = doValidation;
  let bt_open_jsonld = document.getElementById('bt_open_jsonld');
  bt_open_jsonld.onclick = openJsonLD;
  //formatter = new JSONFormatter(JSON.parse(the_data.jsonld_text[0]))
  //document.body.appendChild(formatter.render())
  //formatter.openAtDepth(3)
})

