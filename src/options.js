import browser from 'webextension-polyfill'

var saveConfig = null;

async function saveOption(e) {
  const optionNode = e.currentTarget;
  const optionKey = optionNode.name;
  const optionValue = optionNode.type === 'checkbox' ? optionNode.checked : optionNode.value;
  let config = {};
  config[optionKey] = optionValue;
  console.log(config)
  await saveConfig(config);
}

function setUIValues(config) {
  Object.keys(config).forEach(option => {
    if (! option.startsWith('_')) {
      const optionNode = document.querySelector(`input[name="${option}"]`);
      try {
        switch (optionNode.type) {
          case 'radio':
            const targetRadio = document.querySelector(
              `input[name="${option}"][value="${config[option]}"]`,
            );
            if (targetRadio) {
              targetRadio.checked = true
            }
            break
          case 'checkbox':
            optionNode.checked = config[option];
            break
          default:
            optionNode.value = config[option]
        }
      } catch(e) {
        console.log(e);
      }
    }
  })
}

async function initSimpleSettings(background) {
  console.log('Init simple settings...')
  const config = await background.getTangramConfig();
  console.log("Config loaded = ", config);

  let ele = document.getElementById('bt_reset');
  ele.addEventListener("click",async function() {
    console.debug("reset configuration");
    await background.initializeConfiguration();
    let config = await background.getTangramConfig();
    setUIValues(config);
  });

  setUIValues(config);
  /*
  Object.keys(config).forEach(option => {
    // TODO support also select here
    if (! option.startsWith('_')) {
      const optionNode = document.querySelector(`input[name="${option}"]`);
      try {
        switch (optionNode.type) {
          case 'radio':
            const targetRadio = document.querySelector(
              `input[name="${option}"][value="${config[option]}"]`,
            );
            if (targetRadio) {
              targetRadio.checked = true
            }
            break
          case 'checkbox':
            optionNode.checked = config[option];
            break
          default:
            optionNode.value = config[option]
        }
      } catch(e) {
        console.log(e);
      }
    }
  })

   */
  const options = [...document.querySelectorAll('input[name], select[name]')];
  options.forEach(el => el.addEventListener('change', saveOption))
}

document.addEventListener('DOMContentLoaded', () => {
  browser.runtime.getBackgroundPage().then(function(background){
      saveConfig = background.updateConfiguration;
      initSimpleSettings(background);
  })
});

