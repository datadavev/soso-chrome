/*
Content page for extension.
Single instance of this page per web browser tab.
 */

import browser from 'webextension-polyfill'
import JsonLdBlock from 'common';
/*
 Mutation watcher - watch for selector match
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


var loader_timeout = null;
export var so_data_blocks = [];


function initializeSOData() {
  so_data_blocks = [];
  ready("script[type=\"application/ld+json\"]", function(ele){
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

/*
Responds to messages sent from background or popup.
 */
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.debug('SOSO-content: received message: ', request);
    if (request.name ==='content.load_jsonXX') {
      //load the _tangram_data block
      //That method will send a message when the load is completed
      if (loader_timeout !== null) {
        clearTimeout(loader_timeout);
        loader_timeout = null;
      }
      loader_timeout = setTimeout(function(){
        loadJsonLdBlocks();
      }, 500);
      sendResponse({'status':'ok'});
    }
    if (request.name === 'get_blocks'){
      console.debug("return promise for get_json_compact");
      return Promise.resolve({
        blocks: so_data_blocks
      });
    }
    if (request.name === 'get_block'){
      return Promise.resolve({
        block: so_data_blocks[request.block_idx]
      });
    }

});


window.onload = async function() {
  let test = new JsonLdBlock("{test:0}");

  initializeSOData();
};
