/*
Content page for extension.
Single instance of this page per web browser tab.
 */

import browser from 'webextension-polyfill'
import JsonLdBlock from 'common';
import jsonld from "jsonld";
/*
 Mutation watcher - watch for selector matching to be ready
 */
(function(win) {
    'use strict';

    var listeners = [],
    doc = win.document,
    MutationObserver = win.MutationObserver || win.WebKitMutationObserver,
    observer;

    function ready(selector, fn) {
        // Store the selector and callback to be monitored
        listeners.push({
            selector: selector,
            fn: fn
        });
        if (!observer) {
            // Watch for changes in the document
            observer = new MutationObserver(check);
            observer.observe(doc.documentElement, {
                childList: true,
                subtree: true
            });
        }
        // Check if the element is currently in the DOM
        check();
    }

    function check() {
        // Check the DOM for elements matching a stored selector
        for (var i = 0, len = listeners.length, listener, elements; i < len; i++) {
            listener = listeners[i];
            // Query for elements matching the specified selector
            elements = doc.querySelectorAll(listener.selector);
            for (var j = 0, jLen = elements.length, element; j < jLen; j++) {
                element = elements[j];
                // Make sure the callback isn't invoked with the
                // same element more than once
                if (!element.ready) {
                    element.ready = true;
                    // Invoke the callback with the element
                    listener.fn.call(element, element);
                }
            }
        }
    }

    // Expose `ready`
    win.ready = ready;
})(window);


// Maintains a list of JsonLdBlock instances for JSON-LD found on the page.
export var so_data_blocks = [];

// Track window URL for single page apps that at least manage the URL
var window_location = window.location.pathname;

function locationHashChanged(event) {
  //Called when window.location.href has changed
  console.debug("locationHashChanged: ",event);
  so_data_blocks = [];
    let msg = {
      name:"json_data_changed",
      n_blocks:0,
      n_datasets:0
    };
    browser.runtime.sendMessage(msg);
}

// Watch for mutations to the document, to look for changes to the URL
function documentMutations(mutation_list, observer) {
  //console.debug("DOCUMENT CHANGED");
  if (window.location.pathname !== window_location) {
    console.debug("mutation location href changed");
    window_location = window.location.pathname;
    locationHashChanged(null);
  }
}

var doc_observer = new MutationObserver(documentMutations);
doc_observer.observe(document, {childList:true, subtree:true});


function initializeSOData() {
  console.debug("SOSO-content: initializeSOData");
  so_data_blocks = [];
  ready("script[type=\"application/ld+json\"]", function(ele){
    /*if (window.location.href !== window_location) {
      console.debug("location href changed");
      window_location = window.location.href;
      so_data_blocks = [];
    }*/
    let block_id = "json_block_" + so_data_blocks.length;
    let block = new JsonLdBlock(ele.innerText, block_id);
    so_data_blocks.push(block);
    block._parse().then(function() {
        console.log("JSON: " + so_data_blocks.length + " blocks loaded.");
        let n_blocks = so_data_blocks.length;
        let n_datasets = 0;
        so_data_blocks.forEach((b) => {n_datasets += b.numDatasets});
        let msg = {
          name:"json_data_changed",
          n_blocks:n_blocks,
          n_datasets:n_datasets
        };
        console.log(msg);
        browser.runtime.sendMessage(msg);
      });
  });
}

function updatePopupUI(jsonld_block) {
  browser.runtime.sendMessage({name:'block_updated', block:jsonld_block});
}

/*
  Start validation for each block.
  Returns a list of promises.
 */
async function validateBlocks() {
  console.debug("content.js validateBlocks");
  const val_config = await browser.runtime.sendMessage({name:"get_validation_config"});
  const url = val_config.service_url + "verify";
  console.debug("Config loaded:", val_config);
  for (var i=0; i < so_data_blocks.length; i++){
    if (so_data_blocks[i].validation) {
      if (!so_data_blocks[i]._validated) {
        so_data_blocks[i].validate(url, val_config.shacl, val_config.options, updatePopupUI);
      }
    }
  }
}

/*
Responds to messages sent from background or popup.
 */
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.debug('SOSO-content: received message: ', request);
    if (request.name === 'get_blocks'){
      return Promise.resolve({
        blocks: so_data_blocks
      });
    }
    if (request.name === 'get_block'){
      return Promise.resolve({
        block: so_data_blocks[request.block_idx]
      });
    }
    if (request.name === 'validate_blocks') {
      return new Promise((resolve, reject) => {
        resolve(validateBlocks());
      });
    }
});


window.onload = async function() {
  console.debug("SOSO-content: window.onload");
  initializeSOData();
};
