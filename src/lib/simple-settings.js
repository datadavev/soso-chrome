import browser from 'webextension-polyfill'

const OPTIONS_DEFAULTS = {
  '_revision': 1,
  '_user_updates': 0,
  'service_url': 'https://8m86jksvx8.execute-api.us-east-1.amazonaws.com/dev/verify',
  'shacl_url': 'https://raw.githubusercontent.com/datadavev/science-on-schema.org/2020-SOSOV/validation/shapes/soso_common.ttl',
};

function saveOption(e) {
  const optionNode = e.currentTarget;
  const optionKey = optionNode.name;

  const optionValue = optionNode.type === 'checkbox' ? optionNode.checked : optionNode.value;

  browser.storage.sync.set({ [optionKey]: optionValue })
  console.log("SETTINGS = ")
  console.log(browser.storage.sync.get(null))
}

async function restoreOptions() {
  //const options = await browser.storage.sync.get(OPTIONS_DEFAULTS);
  const options = OPTIONS_DEFAULTS

  Object.keys(options).forEach(option => {
    if (!option.startsWith('_')) {
      // TODO support also select here
      const optionNode = document.querySelector(`input[name="${option}"]`);

      switch (optionNode.type) {
        case 'radio':
          const targetRadio = document.querySelector(
            `input[name="${option}"][value="${options[option]}"]`,
          );
          if (targetRadio) {
            targetRadio.checked = true
          }
          break
        case 'checkbox':
          optionNode.checked = options[option];
          break
        default:
          optionNode.value = options[option]
      }
    }
  })
}

export function bootstrapSettings() {
  let settings = browser.storage.sync.get(null)
  if (settings.revision === undefined || settings.revision < OPTIONS_DEFAULTS.revision) {
    console.log("INFO: settings updated with new base revision")
    browser.storage.sync.set(OPTIONS_DEFAULTS)
  }
}

export default function initSimpleSettings() {
  restoreOptions();
  const options = [...document.querySelectorAll('input[name], select[name]')];
  options.forEach(el => el.addEventListener('change', saveOption))
}
