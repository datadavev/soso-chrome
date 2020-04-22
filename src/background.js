import browser from 'webextension-polyfill'
import PouchDB from 'pouchdb'

let _config = new PouchDB('tangram')

function initializeConfiguration() {
  var bootstrap_config = {
    '_id':'tangram_config',
    'service_url': 'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify',
    'shacl_url': 'https://raw.githubusercontent.com/datadavev/science-on-schema.org/2020-SOSOV/validation/shapes/soso_common.ttl'
  }
  _config.put(bootstrap_config, function(err, result) {
    if (!err) {
      console.log('bootstrap configuration loaded')
    } else {
      if (err.status != 409) { //entry exists
        console.log('Boostrap config unexpected status: '+err);
      }
    }
  })
}

async function getTangramConfig() {
  console.log('getTangramConfig')
  let doc = await _config.get('tangram_config')
  console.log("Got service url = " + doc.service_url)
  return doc
}
window.getTangramConfig = getTangramConfig

async function getShaclShape() {
  console.log('getShaclShape')
  let shacl_ttl = await _config.getAttachment('tangram_config','shacl.ttl')
  return shacl_ttl
}
window.getShaclShape = getShaclShape

async function updateConfiguration(config) {
  let doc = await getTangramConfig()
  Object.assign(doc, config)
  _config.put(doc).then(function(err, result){
    console.log('Problem updating tangram configuration:')
    console.log(err)
  })
}

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


browser.runtime.onInstalled.addListener(async function() {
  // called when extension is installed
  // https://developer.chrome.com/extensions/runtime#event-onInstalled
  console.log('browser.runtime.onInstalled.addListener')
  await initializeConfiguration()
  //await updateConfiguration({service_url:'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify'})
  await loadShaclShape()
})


browser.runtime.onStartup.addListener(function() {
  // called when a profile using this extension is first opened
  // https://developer.chrome.com/extensions/runtime#event-onStartup
  console.log('browser.runtime.onStartup.addListener');
})

