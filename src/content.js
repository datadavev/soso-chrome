import browser from 'webextension-polyfill'
//var browser = require('webextension-polyfill');

function extractJsonLD() {
  var jsonld_texts = [];
  var all_script = document.getElementsByTagName("script");
  for (var i = 0; i < all_script.length; i++) {
    if (all_script[i].hasAttribute('type') && all_script[i].getAttribute('type') == "application/ld+json") {
      var html_text = all_script[i].innerHTML;
      html_text = html_text.replace("//<![CDATA[","").replace("//]]","");
      html_text = html_text.replace("<![CDATA[","").replace("]]>","");
      if (html_text.length > 0) {
        jsonld_texts.push(html_text);
      }
    }
  }
  return jsonld_texts;
}

browser.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.operation == 'get_jsonld')
      sendResponse({
        url: document.location.href,
        jsonld: extractJsonLD()
      });
  });
