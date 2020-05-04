import browser from 'webextension-polyfill'
import jsonld from 'jsonld';

var the_jsonld_texts = null;
var expanded_jsonld = null;
var dataset_count = 0;
const so_datasets = [
  'https://schema.org/Dataset',
  'http://schema.org/Dataset',
  'https://schema.orgDataset',
  'http://schema.orgDataset'
]

function countDatasets(json_obj){
  let nd = 0;
  for (var k in json_obj) {
    if (k === '@type') {
      // in expanded, this will always be an array
      //console.log("types = ", json_obj[k]);
      for (var v in json_obj[k]) {
        //console.log("v = ", json_obj[k][v]);
        if (so_datasets.includes(json_obj[k][v])) {
          nd += 1;
          console.log("Dataset found, nd = ", nd);
        }
      }
    } else if (typeof json_obj[k] === 'object' && json_obj[k] !== null) {
      nd += countDatasets(json_obj[k])
    }
  }
  return nd;
}

async function extractJsonLD() {
  var jsonld_texts = [];
  expanded_jsonld = [];
  var all_script = document.getElementsByTagName("script");
  for (var i = 0; i < all_script.length; i++) {
    if (all_script[i].hasAttribute('type') && all_script[i].getAttribute('type') == "application/ld+json") {
      var html_text = all_script[i].innerHTML;
      html_text = html_text.replace("//<![CDATA[","").replace("//]]","");
      html_text = html_text.replace("<![CDATA[","").replace("]]>","");
      if (html_text.length > 0) {
        jsonld_texts.push(html_text);
        try {
          let json_obj = JSON.parse(html_text);
          let expanded = await jsonld.expand(json_obj);
          dataset_count += countDatasets(expanded);
          expanded_jsonld.push(expanded);
        } catch(err) {
          console.log(err);
          expanded_jsonld.push(null);
        }
      }
    }
  }
  console.log("Found datasets: ", dataset_count);
  the_jsonld_texts = jsonld_texts;
  return jsonld_texts;
}

browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.operation === 'get_jsonld')
      sendResponse({
        url: document.location.href,
        jsonld: the_jsonld_texts
      });
    if (request.operation ==='get_json_count') {
      if (!the_jsonld_texts) {
        //await extractJsonLD();
      }
      try {
        sendResponse({
          tab_id: request.tab_id,
          json_count: the_jsonld_texts.length
        })
      } catch(e) {
        console.log(e)
      }
    }
  });

window.onload = async function() {
  the_jsonld_texts = null;
  // Notify after a couple seconds to allow some time for single page apps to do their thing.
  setTimeout(function(){
    extractJsonLD().then(
      browser.runtime.sendMessage({
        operation:'content_ready'
      }));
  }, 2000);
};
