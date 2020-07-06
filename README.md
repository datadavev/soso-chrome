# SOSO-Chrome

Chrome extension for evaluating [schema.org/Dataset](https://schema.org/Dataset) content against [Science-on-schema.org guidelines](https://science-on-schema.org/) using the Tangram service.

[![Alt text](https://raw.githubusercontent.com/datadavev/soso-chrome/master/publish_assets/sshot-01.png)](https://www.youtube.com/watch?v=CxqB6HIiXPg)

## Installation

Note: This early release has **only** been tested on MacOS 10.15 with a recent version of Chrome.

1. Download the SOSO-chrome.zip file from the [releases page](https://github.com/datadavev/soso-chrome/releases) and unzip it in a folder

2. Visit [chrome://extensions/](chrome://extensions/)

3. Turn on developer mode

4. Click on "Load unpacked" and navigate to the directory where you unzipped the .zip

5. Soso-chrome (aka Tangram) should appear in the toolbar. If not then:

6. "pin" the extension by clicking on the jigsaw like piece to the right of the omnibar, then locate the "Science on schema.org" extension and click on the pin.



## Development

- `yarn start` to compile and watch the files for changes.

  To enable the autoreload on chrome:

  1. Go to `chrome://extensions/`
  1. Make sure **Developer mode** is on
  1. Click **Load unpacked** and choose the **build/** folder

  Instead, if you want to develop on firefox, check out [web-ext](https://github.com/mozilla/web-ext).

- `yarn build` to just compile the files.
- `yarn bundle` to compile the files and put them in a `.zip`, ready to be published.



