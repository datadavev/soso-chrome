import browser from 'webextension-polyfill'
import PouchDB from 'pouchdb'

let _config = new PouchDB('tangram')
var _jsondata = {
  url: null,
  json: null
};

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


browser.runtime.onInstalled.addListener(async function() {
  // called when extension is installed
  // https://developer.chrome.com/extensions/runtime#event-onInstalled
  console.log('browser.runtime.onInstalled.addListener')
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

function updateBadgeWithJsonCount(msg) {
  console.log('JSONLD Count: ',msg);
  if (msg.json_count > 0) {
    browser.browserAction.setBadgeBackgroundColor({
      'tabId': msg.tab_id,
      'color':'#00B946'
    })
  }
  browser.browserAction.setBadgeText({
    'text':msg.dataset_count.toString(),
    'tabId':msg.tab_id
  });
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
  /*
  if (the_tangram_window && the_tangram_window.id !== windowId){
    console.log("Focus changed to potential target");
    try {
      browser.windows.get(windowId, {populate: true}).then(function (win_info) {
        console.log(win_info);
        browser.tabs.query({active: true, currentWindow: true}).then(function (tabs) {
          the_tab = tabs[0];
          doUpdateTangramWindow();
        });
      });
    } catch(e) {
      // pass
    }
  }
   */
});

//Called when user switches tabs
browser.tabs.onActivated.addListener(async function(tabinfo) {
  console.log('Focus changed to tabId: ',tabinfo)
  /*
  if (tabinfo.tabId !== the_tab.id) {
    browser.tabs.get(tabinfo.tabId).then(function(tab){
      the_tab = tab;
      doUpdateTangramWindow();
    })
  }
   */
});

browser.tabs.onUpdated.addListener(async function(tab_id, change_info, tab_info) {
  console.log('Tab onUpdated: ',change_info);
  if (change_info.status ==='complete') {
    //requestJsonCount(tab_id);
  }
});

async function doUpdateTangramWindow(){
  // request content from the content.js
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


function handleContentMessage(request, sender, sendResponse) {
  console.log('Message from content script: ', request);
  console.log('Sender: ', sender)
  if (request.operation === 'jsonld_content') {
    browser.runtime.sendMessage({
      operation: 'set_jsonld',
      url: sender.url,
      jsonld: request.content
    })
  } else if (request.operation === 'get_jsonld') {

  } else if (request.operation === 'tangram_ready') {
    console.log('Tangram window ready.')
    doUpdateTangramWindow();
  } else if (request.operation === 'content_ready') {
    requestJsonCount(sender.tab.id);
  }
}

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
browser.browserAction.onClicked.addListener(populateInspector);
