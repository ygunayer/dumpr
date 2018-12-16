const _ = require('lodash');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const {JSDOM} = require('jsdom');

function getActualPath(original) {
    if (!original) {
        return original;
    }

    return path.join(original.replace(/^\~/, os.homedir())); 
}

async function delay(timeout) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), timeout);
    });
}

async function inBrowserDo(url, fn) {
    const browser = await puppeteer.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const pages = await browser.pages();
    const page = pages[0];
    await page.goto(url);
    const result = await fn({browser, page});
    await browser.close();
    return result;
}

function loadWithoutBrowser(html) {
    const dom = new JSDOM(html);
    return dom.window;
}

function interpolate(str, data = {}) {
    const compiled = _.template(str);
    return compiled(data);
}

module.exports = {
    delay,
    getActualPath,
    inBrowserDo,
    loadWithoutBrowser,
    interpolate
};
