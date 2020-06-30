import browser from 'webextension-polyfill'
import PouchDB from 'pouchdb'
import jsonld from "jsonld";

let _config = new PouchDB('tangram')
var _jsondata = {
  url: null,
  json: null
};

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

/*
Initialize the configuration
 */
function initializeConfiguration() {
  var bootstrap_config = {
    '_id':'tangram_config',
    'service_url': 'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify',
    'shacl_url': 'https://raw.githubusercontent.com/datadavev/science-on-schema.org/2020-SOSOV/validation/shapes/soso_common.ttl',
    'report_format': 'human',
    'external_report_window': false
  }
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

/*
  Retrieve the configuration from the local storage
 */
async function getTangramConfig() {
  console.log('getTangramConfig')
  let doc = await _config.get('tangram_config')
  console.log("Got config: " + doc)
  return doc
}
window.getTangramConfig = getTangramConfig


async function getShaclShape() {
  console.log('getShaclShape')
  let shacl_ttl = await _config.getAttachment('tangram_config','shacl.ttl')
  return shacl_ttl
}
window.getShaclShape = getShaclShape

async function loadShaclShape() {
  // Refreshes the shacl shape in the cache with the url specified in the config
  // The SHACL is a ttl that is attached to the tangram_config entry as "shacl.ttl"
  let doc = await getTangramConfig()
  console.log('loading shacl shape from '+doc.shacl_url)
  const url = doc.shacl_url;
  let request = new XMLHttpRequest();
  request.addEventListener('load', function () {
    const shacl_ttl = new Blob([this.responseText], {type:'text/turtle'})
    console.log(shacl_ttl)
    console.log("revision = ",doc._rev)
    _config.putAttachment('tangram_config', 'shacl.ttl', doc._rev, shacl_ttl, 'text/turtle').then(function (result) {
      console.log('shacl shape updated')
    })
  });
  request.open('GET', url, true)
  request.send()
}

// TODO: Something is up with the toggling, unreliable.
function useExternalPopup(is_external) {
  let detail = {popup:'editor.html'};
  if (is_external) {
    detail.popup = '';
  }
  browser.browserAction.setPopup(detail)
}


async function updateConfiguration(config) {
  let doc = await getTangramConfig()
  Object.assign(doc, config)
  console.log('new before save = ', doc)
  _config.put(doc).then(function(result) {
    console.log(result);
    console.log(doc);
    useExternalPopup(doc.external_report_window);
  }).catch(function(err) {
    console.log('Problem updating tangram configuration:')
    console.log(err)
  })
}
window.updateConfiguration = updateConfiguration


//===============================================================
// JSON-LD processing

function rdfLiterals(rdf, subject) {
  let olist = [];
  rdf.forEach(function(quad) {
    if (quad.subject.value == subject && quad.object.termType == 'Literal') {
      olist.push(quad);
    }
  })
  return olist;
}

async function extractJsonSummary(rdf) {
  //
  let summary = {
    type: null,
    name: null,
    url: null,
    identifier: null,
    _id: null
  };
  //let compacted = await
  console.log(rdf.name);
  rdf.forEach(function (quad) {
    if (quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
      console.log("QUAD: ",quad);
      if (quad.object.value.match(match_so_dataset)){
        summary.type = quad.object.value;
        let terms = rdfLiterals(rdf, quad.subject.value);
        console.log('TERMS: ',terms);
        terms.forEach(function(t,i){
          if (t.predicate.value.match(/http(s?):\/\/schema.org\/name/i)) {
            summary.name = t.object.value;
          }
        })
      }
    }
  });
  return summary
}

function extractJsonSummaries(blocks) {
  //given a list of json RDF, returns summary information
  let results = [];
  for (let i=0; i < blocks.length; i++)
    results.push(extractJsonSummary(blocks[i].rdf));
  console.log("SUMMARY RESULTS: ",results);
  return results;
}


//===============================================================

browser.runtime.onInstalled.addListener(async function() {
  // called when extension is installed
  // https://developer.chrome.com/extensions/runtime#event-onInstalled
  console.log('browser.runtime.onInstalled.addListener');
  await initializeConfiguration()
  let doc = await getTangramConfig()
  useExternalPopup(doc.external_report_window);
  //await updateConfiguration({service_url:'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify'})
  await loadShaclShape()
})


browser.runtime.onStartup.addListener(function() {
  // called when a profile using this extension is first opened
  // https://developer.chrome.com/extensions/runtime#event-onStartup
  console.log('browser.runtime.onStartup.addListener');
})

var monitor_tab_id = null;

var eventList = ['onBeforeNavigate', 'onCreatedNavigationTarget',
    'onCommitted', 'onCompleted', 'onDOMContentLoaded',
    'onErrorOccurred', 'onReferenceFragmentUpdated', 'onTabReplaced',
    'onHistoryStateUpdated'];
eventList = ['onCompleted', 'onTabReplaced'];

eventList.forEach(function(e) {
  browser.webNavigation[e].addListener(function(data) {
    if (typeof data) {
      console.log(chrome.i18n.getMessage('inHandler'), e, data);
    }
    else
      console.error(chrome.i18n.getMessage('inHandlerError'), e);
  });
});

function onJsonLdEditorCreated(win_info) {
  console.log(win_info);
  monitor_tab_id = win_info.tabs[0];
}

function onJsonLdEditorError(error) {
  console.log('onJsonLdEditorError: ${error}')
}

var the_tangram_window = null;
var the_tab = null;

function isTangramOpen() {
  if (! the_tangram_window) {
    return false;
  }
  try {
    browser.windows.get(the_tangram_window.id).then(function(win_info){
    });
  } catch(e) {
    //
    return false;
  }
  return true;
}

function setBadgeAnnotation(tab_id, color, label, text) {
  browser.browserAction.setBadgeBackgroundColor({
    'tabId': tab_id,
    'color': color
  });
  browser.browserAction.setBadgeText({
    'tabId': tab_id,
    'text': label.toString()
  });
  browser.browserAction.setTitle({
    tabId:tab_id,
    title:text
  });
}

function updateBadgeWithJsonCount(tab_id, msg) {
  /*
  msg = {
    name:'json_data_parsed',
    count:_tangram_data.blocks.length,
    parsed:num_parsed,
    issues: _tangram_data.issues,
    types: _tangram_data.types
  }
  const color_unchecked = '#dddddd'; //no parseable jsonld
  const color_nojsonld = '#999999'; //no dataset, has jsonld
  const color_issues = '#FF8800'; //has dataset, issues
  const color_errors = '#CC0000'; //has dataset, validation failed
  const color_ok = '#00AA55';   //has dataset, no issues, validated
   */
  //
  console.log('JSONLD Count: ', msg);
  if (msg.count === 0) {
    setBadgeAnnotation(tab_id, color_unchecked, "0", "No JSON-LD");
    return;
  }
  if (msg.parsed === 0) {
    setBadgeAnnotation(tab_id, color_unchecked, "0", "No parseable JSON-LD");
    return;
  }
  //Add up how many Datasets there are
  let num_datasets = 0;
  for (const atype in msg.types) {
    console.debug("atype = ", atype);
    if (atype.match(match_so_dataset)) {
      console.log("Dataset match");
      num_datasets += msg.types[atype];
    }
  }
  let nds = num_datasets.toString();
  if (num_datasets === 0) {
    setBadgeAnnotation(
      tab_id,
      color_nojsonld,
      nds,
      "No Datasets\n"+msg.count.toString()+" JSON-LD blocks"
    );
    return;
  }
  let issue_count = 0;
  for (let anissue in msg.issues) {
    issue_count += msg.issues[anissue];
  }
  if (issue_count > 0) {
    setBadgeAnnotation(
      tab_id,
      color_issues,
      nds,
      "Datasets with issues\n"+msg.count.toString()+" JSON-LD blocks"
    );
    return;
  }
  setBadgeAnnotation(
    tab_id,
    color_issues,
    nds,
    "Unvalidated Datasets\n"+msg.count.toString()+" JSON-LD blocks"
  );
}

function requestJsonCount(tab_id) {
  browser.tabs.sendMessage(tab_id, {
    operation:'get_json_count',
    tab_id: tab_id
  }).then(updateBadgeWithJsonCount);
}

// called when user switches windows
browser.windows.onFocusChanged.addListener(async function(windowId) {
  console.log('Focus changed to windowId: ' + windowId)
});

//Called when user switches tabs
browser.tabs.onActivated.addListener(async function(tabinfo) {
  console.log('Focus changed to tabId: ',tabinfo)
});

/*
This message is received when the tab is updated. status == complete when the tab is loaded.
 */
browser.tabs.onUpdated.addListener(async function(tab_id, change_info, tab_info) {
  console.log('Tab onUpdated: ',tab_id, change_info);
  if (change_info.status ==='complete') {
    // request a count of the number of JSON blocks
    console.debug("send message: content.load_json");
    browser.tabs.sendMessage(tab_id, {
      name: 'content.load_json'
    })
  }
});


function openJsonLDEditor(eid, text) {
  //TODO: editor URL needs to be dynamic from config
  const tangram_url = "http://localhost:5000/edit";
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
 Handles messages sent from a content tab.
 */
function handleContentMessage(request, sender, sendResponse) {
  console.log('Message from content script: ', request);
  console.log('Sender: ', sender);
  if (request.name === 'open_tangram_editor') {
    openJsonLDEditor(request.eid, request.text);
  }
  if (request.name === 'json_data_changed') {
    // update the badge for the active tab with the number of json blocks
    browser.browserAction.setBadgeBackgroundColor({
      'tabId': sender.tab.id,
      'color': color_unchecked
    });
    browser.browserAction.setBadgeText({
      'text': request.n_blocks.toString() + ":" + request.n_datasets.toString(),
      'tabId': sender.tab.id
    });
    console.log("tab = ", sender);
    browser.tabs.sendMessage(sender.tab.id, {name:'parse_json'});
  }
  if (request.name === 'json_data_parsed') {
    //update the badge text, color, and mouse over text
    console.log('Received: json_data_parsed', request);
    updateBadgeWithJsonCount(sender.tab.id, request);
  }
  if (request.operation === 'jsonld_content') {
    browser.runtime.sendMessage({
      operation: 'set_jsonld',
      url: sender.url,
      jsonld: request.content
    })
  } else if (request.operation === 'get_jsonld') {

  } else if (request.operation === 'tangram_ready') {
    console.log('Tangram window ready.');
    //doUpdateTangramWindow();
  } else if (request.operation === 'content_ready') {
    requestJsonCount(sender.tab.id);
  }
}




async function doUpdateTangramWindow(){
  // request content from the content.js
  return;
  let _tabid = null
  try {
    _tabid = the_tab.id;
  } catch(e) {
    let caller = await browser.tabs.query({active: true, currentWindow: true});
    the_tab = caller[0];
    _tabid = the_tab.id;
  }
  try {
    let response = await browser.tabs.sendMessage(_tabid, {operation: 'get_jsonld'});
    console.log("sendMessage response = ", response);
    _jsondata.url = response.url;
    _jsondata.json = response.jsonld;

    console.log('sending set_jsonld');
    let popresponse = await browser.runtime.sendMessage({
      operation: 'set_jsonld',
      url: response.url,
      jsonld: response.jsonld
    })
    /*
    browser.tabs.insertCSS(the_tab.id, {
      code:'body {border: 5px solid red;}'
    });
     */
    console.log('done sending set_jsonld')
  } catch(e) {
    console.log(e);
  }
}
window.doUpdateTangramWindow = doUpdateTangramWindow;



async function openTangramWindow(){
  let create_window = true;
  if (the_tangram_window) {
    try {
      let test = await browser.windows.get(the_tangram_window.id);
      console.log(test);
      create_window = false;
      doUpdateTangramWindow();
    } catch(e) {
      console.log(e);
      the_tangram_window = null;
    }
  }
  if (create_window) {
    // Need to create the tangram window. It was either closed or not opened.
    browser.windows.create({
      url: browser.runtime.getURL("editor.html"),
      type: 'popup',
      width: 800
    }).then(function(wininfo) {
      the_tangram_window = wininfo;
      console.log('the_tangram_window', the_tangram_window);
    })
  }
}

async function populateInspector(tab) {
  console.log('Load tangram');
  let caller = await browser.tabs.query({active:true, currentWindow:true});
  the_tab = caller[0];
  openTangramWindow();
}

browser.runtime.onMessage.addListener(handleContentMessage);
//browser.browserAction.onClicked.addListener(populateInspector);
