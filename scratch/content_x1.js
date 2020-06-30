import browser from 'webextension-polyfill'
import jsonld from 'jsonld';

// Check for changes to page json-ld every xx ms.
// A value of 0 disables ongoing checks.
const RDF_TYPE='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const schema_org_any_match = /^http(s?):\/\/schema\.org/gi;
const schema_org_http_match = /^http:\/\/schema\.org/gi;
const schema_org_slash_match = /^https:\/\/schema\.org\//gi;
const _issue_no_jsonld = 1;
const _issue_schema_org_http = 2;
const _issue_schema_org_slash = 3;
const _issue_json_parse_fail = 4;
const _issue_json_ld_parse_fail = 5;
const issue_descriptions = {
  _issue_no_jsonld: 'No json-ld available',
  _issue_schema_org_http: 'Schema.org namespace uses http',
  _issue_schema_org_slash: 'Schema.org namespace no trailing slash',
  _issue_json_parse_fail: 'Error parsing JSON content',
  _issue_json_ld_parse_fail: 'Error parsing JSON-LD RDF'
};

var _tangram_data = {
  check_count: 0,
  max_checks: 3,
  check_timeout: 3000,
  size: 0,       // total size of all block texts
  baseURI: null, // Current URI of the page, this may change in single page apps
  blocks:[],     // list of json-ld blocks found in document, {text:, parsed:, rdf:}
  types:{},      // type:count discovered in all blocks
  issues: {}
};

function initializeTangramData() {
  _tangram_data.check_count = 0;
  _tangram_data.size = 0;
  _tangram_data.baseURI = null;
  _tangram_data.blocks = [];
  _tangram_data.types = {};
  _tangram_data.issues = {};
  _tangram_data.issues[_issue_no_jsonld] = 0;
  _tangram_data.issues[_issue_schema_org_http] = 0;
  _tangram_data.issues[_issue_schema_org_slash] = 0;
  _tangram_data.issues[_issue_json_parse_fail] = 0;
  _tangram_data.issues[_issue_json_ld_parse_fail] = 0;
}

/*++++++++++++++++++++++++++++
 * Custom loader for avoiding content load over different protocols
 */
// grab the built-in Node.js doc loader
const nodeDocumentLoader = jsonld.documentLoaders.xhr();

// change the default document loader,
// but only for http requests to schema.org to avoid CORs issues
const customLoader = async (url, options) => {
  if (url.match(schema_org_any_match)) {
    if (url.match(schema_org_http_match)) {
      url = url.replace('http://', 'https://');
      _tangram_data.issues[_issue_schema_org_http] += 1;
    }
    if (!url.match(schema_org_slash_match)) {
      url = url.replace('https://schema.org', 'https://schema.org/');
      _tangram_data.issues[_issue_schema_org_slash] += 1;
    }
  }
  return nodeDocumentLoader(url);
};
jsonld.documentLoader = customLoader;
/* -------------------------------- */

function extractJsonLD() {
  /*
    Extract the JSON-LD text from the page.
    There may be more than one block of JSON-LD text returned.
    The text is not parsed so may be invalid.
   */
  let jsonld_texts = [];
  let all_script = document.getElementsByTagName('script');
  for (var i = 0; i < all_script.length; i++) {
    if (all_script[i].hasAttribute('type')
      && all_script[i].getAttribute('type') === 'application/ld+json') {
      var html_text = all_script[i].innerHTML;
      html_text = html_text.replace("//<![CDATA[","").replace("//]]","");
      html_text = html_text.replace("<![CDATA[","").replace("]]>","");
      if (html_text.length > 0) {
        jsonld_texts.push({text:html_text, parsed:null, rdf:null, types:[]});
      }
    }
  }
  return jsonld_texts;
}

function getSizeOfBlocks(blocks){
  // Get total size of text blocks
  let size = 0;
  for (let i=0; i<blocks.length; i++) {
    size += blocks[i].text.length;
  }
  return size;
}

function loadJsonLdBlocks(){
  // Sets _tangram_data size and blocks
  // Emits a message json_data_changed if there's a change in data
  let blocks = extractJsonLD();
  let block_size = getSizeOfBlocks(blocks);
  _tangram_data.baseURI = document.baseURI;
  _tangram_data.blocks = blocks;
  _tangram_data.size = block_size;
  console.info("json_data_changed");
  browser.runtime.sendMessage({name:"json_data_changed", count:_tangram_data.blocks.length});
  if (_tangram_data.blocks.length < 1) {
    setTimeout(keepCheckingForBlocks, _tangram_data.check_timeout);
  }
}

function keepCheckingForBlocks() {
  if (_tangram_data.check_count > _tangram_data.max_checks) {
    return;
  }
  _tangram_data.check_count += 1;
  loadJsonLdBlocks();
}

async function parseJsonBlocks() {
  console.debug('parseJsonBlocks');
  let num_parsed = 0;
  _tangram_data.types = {};
  for (let i=0; i< _tangram_data.blocks.length; i++) {
    let entry = {
      parsed: null,
      rdf: null,
      types: {},
      issues: []
    };
    try {
      entry.parsed = JSON.parse(_tangram_data.blocks[i].text);
      num_parsed += 1;
      try {
        entry.rdf = await jsonld.toRDF(entry.parsed);
        entry.rdf.forEach(function (quad) {
          if (quad.predicate.value === RDF_TYPE) {
            let t = quad.object.value;
            console.debug("found type:", t);
            if (entry.types[t]) {
              entry.types[t] += 1;
            } else {
              entry.types[t] = 1;
            }
            if (_tangram_data.types[t]) {
              _tangram_data.types[t] += 1;
            } else {
              _tangram_data.types[t] = 1;
            }
          }
        });
      } catch(e) {
        console.error(e);
        _tangram_data.issues[_issue_json_ld_parse_fail] += 1;
      }
    } catch(e) {
      console.error(e);
      _tangram_data.issues[_issue_json_parse_fail] += 1;
    }
    _tangram_data.blocks[i].parsed = entry.parsed;
    _tangram_data.blocks[i].rdf = entry.rdf;
    _tangram_data.blocks[i].types = entry.types;
  }
  console.info('Send message: json_data_parsed');
  browser.runtime.sendMessage({
    name:'json_data_parsed',
    count: _tangram_data.blocks.length,
    parsed: num_parsed,
    issues: _tangram_data.issues,
    types: _tangram_data.types
  })
}

function validateJsonBlocks(validators) {
  /*
  Validate blocks according to the validators provided.

  Only applies to parsed blocks that contain type_name

  validators = [
    {type_name:'', service_url:'',shape_file:''},
    ...
  ]
   */
  //TODO: decide on this - too many validation paths here - make it a max of one per block
  let promises = [];
  for (let ib=0; ib < _tangram_data.blocks.length; ib++) {
    for (let iv=0; iv < validators.length; iv ++) {
      if (blockHasType(_tangram_data.blocks[ib].parsed, validators[iv].type_name)) {
        //perform validation
      }
    }
  }
  Promise.allSettled(promises).then(function(data){
    console.info("Validators complete, sendMessage jsonld_validation_complete");
    browser.runtime.sendMessage({
      name:'jsonld_validation_complete',

    })
  });
}


browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('content received message: ', request);
    if (request.name ==='load_json') {
      //load the _tangram_data block
      //That method will send a message when the load is completed
      setTimeout(function(){
        initializeTangramData();
        loadJsonLdBlocks();
      }, 500);
      sendResponse({'status':'ok'});
    }
    if (request.name === 'parse_json') {
      //Background asking to parse the json blocks
      setTimeout(parseJsonBlocks, 100);
      sendResponse({'status':'ok'});
    }
    if (request.name === 'get_json'){
      console.log("return promise for get_json");
      return Promise.resolve({
        baseURI: _tangram_data.baseURI,
        blocks: _tangram_data.blocks,
        types: _tangram_data.types
      });
    }
  });

window.onload = async function() {
  initializeTangramData();
};
