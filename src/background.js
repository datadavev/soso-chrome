import browser from 'webextension-polyfill'
import PouchDB from 'pouchdb'

let _config = new PouchDB('tangram');

// Variants of how a "Dataset" may be appear, only one of which is "correct"
const match_so_dataset = /^http(s?):\/\/schema.org(\/?)Dataset/gi;

// badge conditions
const is_unchecked = 0;
const no_jsonld = 1;
const has_issues = 2;
const has_jsonld = 3;

// Colors for badge label
const label_colors = {};
label_colors[is_unchecked]  = '#cccccc';
label_colors[no_jsonld]  = '#888888';
label_colors[has_issues] = '#CC0000';
label_colors[has_jsonld] =  '#00AA55';
label_colors[has_issues + has_jsonld] = '#FF8800';
label_colors[no_jsonld + has_issues + has_jsonld] = '#0088FF';

const color_unchecked = '#888888'; //no parseable jsonld
const color_nojsonld = '#666666'; //no dataset, has jsonld
const color_issues = '#FF8800'; //has dataset, issues
const color_errors = '#CC0000'; //has dataset, validation failed
const color_ok = '#00AA55';   //has dataset, no issues, validated

export var cb_setJsonLD = null;

const bootstrap_configuration_url = "https://dave.vieglais.com/config/tangram/dev-config.json";

/*
Initialize the configuration
 */
function doInitializeConfiguration(data) {
  var bootstrap_config = {
    '_id':'tangram_config',
    //'service_url': data.service.url,
    'service_url': "http://localhost:5000",
    'shacl_url': data.shacl.url,
    'report_format': 'human',
    'external_report_window': false
  };
  updateConfiguration(bootstrap_config);

  return;
  _config.put(bootstrap_config, function(err, result) {
    if (!err) {
      console.log('bootstrap configuration loaded')
    } else {
      if (err.status != 409) { //entry exists
        console.log('Boostrap config unexpected status: ', err);
      }
    }
  })
}


function initializeConfiguration() {
  fetch(bootstrap_configuration_url)
    .then(response => response.json())
    .then(data => doInitializeConfiguration(data))
    .then(console.debug("initializeConfiguration Complete"));
}


/*
  Retrieve the configuration from the local storage
 */
async function getTangramConfig() {
  console.log('getTangramConfig');
  let doc = await _config.get('tangram_config');
  console.log("Got config: ",doc);
  return doc
}
window.getTangramConfig = getTangramConfig


async function getShaclShape() {
  console.log('getShaclShape');
  let shacl_ttl = await _config.getAttachment('tangram_config','shacl.ttl');
  return shacl_ttl
}
window.getShaclShape = getShaclShape;

function shaclShapeLoader(){
    const shacl_ttl = new Blob([this.responseText], {type:'text/turtle'});
    console.debug("Shacl text = ", this.responseText);
    _config.get('tangram_config').then(function(doc){
      console.debug("config revision = ", doc._rev);
      console.debug("turtle = ", shacl_ttl);
      _config.putAttachment('tangram_config', 'shacl.ttl', doc._rev, shacl_ttl, 'text/turtle')
        .then(function(result){
          console.debug("Save attachment result = ", result);
        })
    })
}

async function loadShaclShape() {
  // Refreshes the shacl shape in the cache with the url specified in the config
  // The SHACL is a ttl that is attached to the tangram_config entry as "shacl.ttl"
  getTangramConfig()
    .then(function(doc){
      console.log('A. load shacl shape from '+doc.shacl_url);
      let request = new XMLHttpRequest();
      request.addEventListener('load', shaclShapeLoader);
      request.open('GET', doc.shacl_url, true);
      request.send()
    });
}


async function updateConfiguration(config) {
  let doc = await getTangramConfig();
  Object.assign(doc, config);
  doc.service_url = doc.service_url.trim();
  if (!doc.service_url.endsWith("/")) {
    doc.service_url = doc.service_url + "/";
  }
  console.log('new before save = ', doc);
  _config.put(doc).then(function(result) {
    console.log(result);
    console.log(doc);
  }).catch(function(err) {
    console.log('Problem updating tangram configuration:');
    console.log(err)
  })
}
window.updateConfiguration = updateConfiguration;


//===============================================================
/*
 Posts a JSON-LD block to the tangram editor.

 Called from popup with a message open_tangram_editor

 Done here because opening a window in popup closes that window.
 */
async function openJsonLDEditor(eid, text) {
  //TODO: editor URL needs to be dynamic from config
  const config = await getTangramConfig();
  const tangram_url = config.service_url + "edit";
  const win_name = eid;
  var form = document.createElement("form");
  form.setAttribute("method", "POST");
  form.setAttribute("action", tangram_url);
  form.setAttribute("enctype", "multipart/form-data");
  let inp = document.createElement('input');
  inp.id = "dg";
  inp.type = "hidden";
  inp.name = "dg";
  //inp.value = new Blob([text], {type:"application/ld+json"});
  inp.value = text;
  form.appendChild(inp);
  document.body.appendChild(form);
  console.debug("Opening window ", win_name);
  var win = window.open('', win_name);
  form.target = win_name;
  console.debug("Posting form data ", form);
  form.submit();
  document.body.removeChild(form);
}


/*
 Called when extension is installed.
 https://developer.chrome.com/extensions/runtime#event-onInstalled
 */
browser.runtime.onInstalled.addListener(async function() {
  console.debug('browser.runtime.onInstalled.addListener');
  await initializeConfiguration();
  //let doc = await getTangramConfig()
  //await updateConfiguration({service_url:'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify'})
  await loadShaclShape();
})

/*
  Called when a profile using this extension is first opened
  https://developer.chrome.com/extensions/runtime#event-onStartup
 */
browser.runtime.onStartup.addListener(function() {
})


/*
This message is received when the tab is updated. status == complete when the tab is loaded.
 */
browser.tabs.onUpdated.addListener(async function(tab_id, change_info, tab_info) {
});


/*
 Handles messages sent from a content tab.
 json_data_changed
 */
async function handleContentMessage(request, sender, sendResponse) {
  console.debug('Message from content script: ', request.name);
  console.debug('Sender: ', sender);
  if (request.name === 'open_tangram_editor') {
    openJsonLDEditor(request.eid, request.text);
  }
  if (request.name === 'json_data_changed') {
    // update the badge for the active tab with the number of json blocks
    browser.browserAction.setBadgeBackgroundColor({
      'tabId': sender.tab.id,
      'color': color_unchecked
    });
    let btext = "";
    if (request.n_blocks > 0) {
      btext = request.n_blocks.toString() + ":" + request.n_datasets.toString();
    }
    browser.browserAction.setBadgeText({
      'text': btext,
      'tabId': sender.tab.id
    });
    console.log("tab = ", sender);
    browser.tabs.sendMessage(sender.tab.id, {name:'parse_json'});
  }
  if (request.name === 'get_validation_config') {
    //return the SHACL document, service URL, and operation params
    let shacl = await getShaclShape();
    let shacl_text = await shacl.text();
    let config = await getTangramConfig();
    let response = {
      name: "getValidationConfigResponse",
      shacl: shacl_text,
      service_url: config.service_url,
      options: { infer:true }
    };
    return Promise.resolve(response);
  }
}

browser.runtime.onMessage.addListener(handleContentMessage);
