/*
Routines to support processing of JSON-LD content.
*/

/****
 Editor
*/
import browser from 'webextension-polyfill'
import jsonld from 'jsonld';

const EDITOR_OPTIONS =     {
  matchBrackets: true,
  autoCloseBrackets: true,
  mode: 'application/ld+json',
  lineNumbers: true,
  //lineWrapping: true,
  theme:'idea',
  gutters:["CodeMirror-linenumbers", "CodeMirror-lint-markers"],
  lint:true,
  autoRefresh: true,
  extraKeys:{
    "Ctrl-Y": cm => CodeMirror.commands.foldSub(cm),
    "Ctrl-I": cm => CodeMirror.commands.unfoldAll(cm),
  }
};

/*
Base class for binding with Alpine UI

@param _id = id of document element for x-data
@param _name = name of variable at window scope
@param initialize = if true, the initialize Alpine,
*/
class AlpineBaseData {
  constructor(_id, _name, initialize=false) {
    this._id = _id;
    this._name = _name;
    window[this._name] = this;
    this.data = {
      _ticker: 0
    }
    if (initialize) {
      this.initializeUI();
    }
  }

  async initializeUI(){
    let ele = document.getElementById(this._id);
    ele.setAttribute('x-data', "window['" + this._name + "'].data");
    ele.setAttribute('x-bind:_ticker', "_ticker");
    await Alpine.initializeComponent(ele);
  }

  updateUI() {
    let ele = document.getElementById(this._id);
    ele.__x.$data._ticker += 1;
  }

  setV(p, v) {
    this.data[p] = v;
    this.updateUI();
  }
}

/*
JSON-LD handling
 */
/*++++++++++++++++++++++++++++
 * Custom loader for avoiding content load over different protocols
 */
const NS_SCHEMA_HTTPS = 'https://schema.org/';
const NS_SCHEMA_HTTP = 'http://schema.org/';
const RDF_TYPE='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const schema_org_any_match = /^http(s?):\/\/schema\.org/gi;
const schema_org_http_match = /^http:\/\/schema\.org/gi;
const schema_org_slash_match = /^https:\/\/schema\.org\//gi;

// grab the built-in Node.js doc loader
// TODO: Load documents from PouchDB where possible to avoid unreliable schema.org connections
const nodeDocumentLoader = jsonld.documentLoaders.xhr();
//const nodeDocumentLoader = jsonld.documentLoader;

// change the default document loader,
// but only for http requests to schema.org to avoid CORs issues
/*
    return {
      contextUrl: null, // this is for a context via a link header
      document: CONTEXTS[url], // this is the actual document that was loaded
      documentUrl: url // this is the actual context URL after redirects
    };
*/
const customLoader = async (url, options) => {
  console.log(url);
  /*
  if (url.match(schema_org_any_match)) {
    if (url.match(schema_org_http_match)) {
      url = url.replace('http://', 'https://');
    }
    if (!url.match(schema_org_slash_match)) {
      url = url.replace('https://schema.org', 'https://schema.org/');
    }
  }
  */
  return nodeDocumentLoader(url);
};
//jsonld.documentLoader = customLoader;
/* -------------------------------- */

const so_ns_context = {
  "@context":{
    "SO":"http://schema.org/",
    "SOa":"https://schema.org/"
  }
};

const so_Dataset_frame = {
  "@context":{
    "@vocab":"http://schema.org/"
  },
  "@type":["Dataset"],
  "name":{},
  "description":{},
  "@explicit": true
};

const so_http_Dataset_frame = {
  "@context":{
    "@vocab":"http://schema.org/"
  },
  "@type":["Dataset"],
  "name":{},
  "description":{},
  "@explicit": true
};

let dataset_frames = {};
dataset_frames[NS_SCHEMA_HTTPS] = so_Dataset_frame;
dataset_frames[NS_SCHEMA_HTTP]  = so_http_Dataset_frame;

function whichNamespace(t){
  if (t.startsWith('SO:')) {
    return NS_SCHEMA_HTTPS;
  } else if (t.startsWith('SOa:')) {
    return NS_SCHEMA_HTTP;
  }
  if (t.match(schema_org_http_match)) {
    return NS_SCHEMA_HTTP;
  }
  if (t.match(schema_org_any_match)) {
    return NS_SCHEMA_HTTPS;
  }
  return null;
}

/*
Class JsonLDBlock provides routines for examining a
block of JSON-LD data
 */

class JsonLDBlock {
  constructor(text) {
    this.source = text;
    this.compacted = null;
    this.namespace = null;
    this.id = null;
    this._editor = null;
    this._parent = null;
  }

  get data() {
    return JSON.parse(this.source);
  }

  get name() {
    try {
      //TODO, what about multiple instances...
      return this.compacted['@graph'][0].name
    } catch(e) {
      console.log("No name");
    }
    return "<<no name>>";
  }

  async expand() {
    let d = this.data;
    return jsonld.expand(d);
  }

  get formatted() {
    let d = this.data;
    return JSON.stringify(d, null, 2);
  }

  async onEditorChange(e,c) {
    /*
      Do stuff in here in response to edits to the
      document. Call blocks.updateUI to update the UI
      when done.

      Note that access to this is through the __source
      property attached to the editor instance e.
    */
    console.log("Content edited");
    console.log(e); //editor instance attached to this
    console.log(c); //change that was made
    console.log(e.__source.id); //Accessing this through the editor
    //Retrieve the editor text and update the JSONld source
    e.__source.source = e.doc.getValue();
    //Figure the namespoce for the content
    let ns = await e.__source.grokNamespace();
    //Compute the standar frame for rendering
    await e.__source.compact(dataset_frames[ns]);
    console.log(e.__source.compacted)

    // Notify the parent to update the UI.
    blocks.updateUI();

  }

  editor(ele) {
    console.log(ele[this.id]);
    console.log(this);
    if (this._editor === null) {
      this._editor = CodeMirror.fromTextArea(ele[this.id], EDITOR_OPTIONS);
      this._editor.__source = this
      this._editor.doc.setValue(this.formatted);
      this._editor.on(
        'change',
        this.onEditorChange
      );
    }
    return this._editor.doc.getValue();
  }

  compactFormatted() {
    return JSON.stringify(this.compacted, null, 2);
  }

  async getDatasetView() {
    let d = this.data;
    console.log("Using namespace = " + this.namespace);
    let frame = dataset_frames[this.namespace];
    console.log("Frame:");
    console.log(frame);
    return jsonld.frame(d, frame, {omitGraph:false});
  }

  async compact(context) {
    //if (this.compacted !== null) {
    //  return this.compacted;
    // , {omitGraph:false}
    //}
    let d = this.data;
    //return jsonld.compact(d, context)
    this.compacted = await jsonld.frame(d,context,{omitGraph:false})
    //.then((c) => {
    //  this.compacted = c;
    //  return this;
    //})
    /*
    return jsonld.frame(d,context,{omitGraph:false})
      .then((f) => {
        console.log("Framed:");
        console.log(f);
        return jsonld.compact(f, context);
      })
    //return jsonld.compact(d, context)
      .then((c) => {
        console.log("Compacted:");
        console.log(c);
        this.compacted = c;
      });
      */
  }

  get isConjunctiveGraph() {
    return this.compacted.hasOwnProperty('@graph');
  }

  async grokNamespace(){
    console.log("GROK Namespace");
    let d = this.data;
    let c = await jsonld.compact(d, so_ns_context);
    if (c.hasOwnProperty('@graph')) {
      c['@graph'].forEach( g => {
        let t = g['@type'];
        this.namespace = whichNamespace(t);
        return this.namespace;
      })
    } else {
      let t = c['@type'];
      this.namespace = whichNamespace(t);
    }
    return this.namespace;
  }

  types() {
    let res = [];
    if (this.isConjunctiveGraph) {
      this.compacted['@graph'].forEach(g => {
        res.push(g['@type']);
      })
    } else {
      res.push(this.compacted['@type']);
    }
    return res;
  }

  getName(for_type) {

  }
}

/*
Class JsonLDBlocks provides a container for multiple JsonLDBlock instances
 */
class JsonLDBlocks extends AlpineBaseData {
  constructor(element_id, var_name) {
    super(element_id, var_name, false);
    this.data.blocks = [];
    this.data.baseURI = '';
  }

  addBlock(b, update_ui=true) {
    b.id = "ta_" + this.data.blocks.length.toString();
    this.data.blocks.push(b);
    if (update_ui) {
      this.updateUI();
     }
  }

  load(doc){
    //doc is a DOM instance, typically window.document
    this.data.baseURI = doc.baseURI;
    let all_script = doc.getElementsByTagName('script');
    for (var i = 0; i < all_script.length; i++) {
      if (all_script[i].hasAttribute('type')
        && all_script[i].getAttribute('type') === 'application/ld+json') {
        var html_text = all_script[i].innerHTML;
        html_text = html_text.replace("//<![CDATA[","").replace("//]]","");
        html_text = html_text.replace("<![CDATA[","").replace("]]>","");
        if (html_text.length > 0) {
          this.addBlock(new JsonLDBlock(html_text), false);
        }
      }
    }
  }

  expand(target) {
    let promises = [];
    this.data.blocks.forEach(b => {
      promises.push(b.expand());
    });
    Promise.all(promises).then(data => {
      data.forEach( d => {
        console.log(d);
        target.innerText += JSON.stringify(d,null,2);
        target.innerText += "\n====\n";
      })
    })
  }

  showCompacted(target) {
    this.data.blocks.forEach(b => {
      target.innerText += b.compactFormatted();
      target.innerText += "\n====\n";
    })
  }

  async compact(context, target) {
    let promises = []
    this.data.blocks.forEach(b => {
      let p = b.compact(context);
      promises.push(p);
    });
    await Promise.all(promises);
  }

  types(target) {
    let res = []
    this.data.blocks.forEach(b=>{
      res.push(b.types());
    })
    return res;
  }

  async prepareBlocks(){
    let promises = [];
    this.data.blocks.forEach(b => {
      promises.push(b.grokNamespace())
    });
    let nss = await Promise.all(promises);
    nss.forEach(ns => {
      console.log("Namespace = " + ns);
    })
    this.updateUI();
  }

  async datasetViews() {
    let promises = [];
    this.data.blocks.forEach(b => {
      promises.push(b.getDatasetView());
    })
    return await Promise.all(promises);
  }
}

function initializeBlocksEditor(editor_wrapper_id, window_var_name) {
  // Initialize, load, and prepare blocks for editing.
  var blocks = new JsonLDBlocks(editor_wrapper_id, window_var_name);
  blocks.initializeUI().then(function(){
    blocks.load();
    blocks.parepareBlocks().then(function() {
      blocks.datasetViews().then(dss => {
        dss.forEach(ds => {
          console.log("result:", ds);
        })
      })
    })
  })
}

/* Example startup:
window.onload = function() {
  window.setTimeout(initializeBlockseditor, 10, 'id_json_editors', 'jsonld_blocks');
}
 */
