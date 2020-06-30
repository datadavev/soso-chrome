import browser from 'webextension-polyfill';
import Alpine from 'alpinejs';
import JsonLdBlock from 'common';
import Spectre from "../../tangram/src/web/static/lib/spectre.js";

function copyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.style.position = 'fixed';
  textArea.style.top = 0;
  textArea.style.left = 0;
  textArea.style.width = '2em';
  textArea.style.height = '2em';
  textArea.style.padding = 0;
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    Spectre.Toast.info("JSON-LD block copied to clipboard.",null,{timeout:1500});
  } catch(err) {
    console.log("Unable to copy validation report to clipboard.")
  }
  document.body.removeChild(textArea);
}


class AlpineBlockData {
  constructor(_id, _name, initialize=false) {
    this._id = _id;
    this._name = _name;
    window[this._name] = this;
    this.data = {
      _ticker: 0,
      blocks: [],
      base_uri: ""
    };
    if (initialize) {
      this.initializeUI();
    }
  }

  async initializeUI(){
    let ele = document.getElementById(this._id);
    ele.setAttribute('x-data', "window['" + this._name + "'].data");
    ele.setAttribute('x-bind:_ticker', "_ticker");
    await Alpine.initializeComponent(ele);
    let elist = document.querySelectorAll("[id$='_copy']");
    for (var i=0; i < elist.length; i++) {
      elist[i].addEventListener("click",function(){
        let eid = this.id;
        eid = eid.substring(0, eid.indexOf("_copy"));
        let text = document.getElementById(eid).innerText;
        copyTextToClipboard(text);
      })
    }
    elist = document.querySelectorAll("[id$='_edit']");
    for (var i=0; i < elist.length; i++) {
      elist[i].addEventListener("click",function(){
        let eid = this.id;
        eid = eid.substring(0, eid.indexOf("_edit"));
        let msg = {
          'name': 'open_tangram_editor',
          'eid':eid,
          'text': document.getElementById(eid).innerText
        };
        browser.runtime.sendMessage(msg);
      })
    }

  }



  updateUI() {
    let ele = document.getElementById(this._id);
    ele.__x.$data._ticker += 1;
  }

  setV(p, v) {
    this.data[p] = v;
    this.updateUI();
  }

  addBlocks(blocks) {
    for (var i=0; i<blocks.length; i++) {
      this.data.blocks.push(new JsonLdBlock((blocks[i])));
    }
  }
}


function showSources() {
  let el = document.getElementById("show_src");
  el.innerText = "";
  data_blocks.blocks.forEach(function(b) {
    console.debug(b);
    let txt = b.dataText;
    txt += "\n//============//\n";
    el.innerText = el.innerText + txt;
  })
}


async function getJsonCompact(block_idx) {
  browser.tabs.query({active:true, currentWindow:true}).then(function(tabs) {
    browser.tabs.sendMessage(tabs[0].id, {
      name: 'get_json_compact',
      block_idx: block_idx
    }).then(function (response) {
      let blocks = response.blocks;
      showSources(blocks);
    });
  });
}

async function updateUI(ele_id){
  ele_id = ele_id || 'dataset_view';
  var ele = document.getElementById(ele_id);
  await Alpine.initializeComponent(ele);
  console.debug(ele);
  ele.__x.$data._ticker += 1;
}

window.onload = async function() {
  window.Alpine.start();
  var db = new AlpineBlockData("jsonld_view", "data_blocks", false);
  browser.tabs.query({active:true, currentWindow:true}).then(function(tabs){
    browser.tabs.sendMessage(tabs[0].id, {name:'get_blocks'}).then(function(response){
      db.addBlocks(response.blocks);
      db.initializeUI();
      //db.updateUI();
    });
    //browser.tabs.sendMessage(tabs[0].id, {name:'get_block', block_idx:0}).then(function(response){
    //  let block = new JsonLdBlock(response.block);
    //  console.log(block);
    //});
  });
};
