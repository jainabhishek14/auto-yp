"use strict";

const puppeteer = require('puppeteer');
const ProxyLists = require('proxy-lists');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');

const config = require("./config");

const WEBSITE_DOMAIN = "https://yellowpages.webindia123.com";
const PAGE_LENGTH = 10;

let dbConnection;
let numPages = 1000;

const isProduction = process.env.NODE_ENV === "production";

let proxies = [];
const options = {
    filterMode: 'strict',
    browser: {
		headless: true,
		slowMo: 0,
		timeout: 10000,
	},
	countries: null,
    protocols: ['http', 'https'],
    anonymityLevels: ['anonymous', 'elite']
};

const getProxies = () => {
    let proxyList = [];
    ProxyLists.getProxies(options)
    .on('data', function(proxies) {
        // Received some proxies.
        console.log('got some proxies');
        proxyList.push(proxies);
    })
    .once('end', function() {
        // Done getting proxies.
        console.log('end!');
        proxies = Object.assign({}, proxyList);
    });
}

// const getRandomProxy = async () => {
//     await getProxies();
//     return proxies[Math.random() * proxies.length]
// }

const processContent = async (text) => {
    let items = [];
    const $ = cheerio.load(text);
    numPages = Math.ceil($("div.bt:nth-child(3)").text().split(" ")[2] / PAGE_LENGTH);
    await $(".cat_80 > table:nth-child(5) .sbox").each((i, element) => {
        items.push({
            title: $(element).find("h4").text(),
            url: `${WEBSITE_DOMAIN}/${$(element).find("a").attr("href")}`,
            processed: false,
            added_at: new Date().toISOString()
        });
    });
    return items;
}

const initializeConnection = async () => {
    try {
        dbConnection = dbConnection || await MongoClient.connect(`mongodb://${config.db.host}:${config.db.port}`, { useUnifiedTopology: true });
        return dbConnection.db(config.db.dbName);
    } catch (err) {
        console.error(`Unable to connect to DB`, err);
    }
    
}

const saveToDB = async (data) => {
    try {
        const db = await initializeConnection();
        console.log(`Saving: ${data.length} records.`);
        return await db.collection("chemists").insertMany(data)
    } catch (err) {
        console.error(`Unable to save items`, err);
    }
};

(async () => {
    let counter = 42;
    await getProxies();
    while(counter <= numPages){
        const browser = await puppeteer.launch({
            headless: !isProduction, 
            slowMo: isProduction ? 0 : 250,
            timeout: isProduction ? 30000 : 0,
          //   args: [ `--proxy-server=${proxy.protocols[0]}://${proxy.ipAddress}:${proxy.port}` ]
          });
        const page = await browser.newPage();
        await page.goto(`${WEBSITE_DOMAIN}/d-py/delhi/delhi/chemists-352/${counter}`, {timeout: 0, waitUntil: 'networkidle2'});
        page.content()
            .then(text => processContent(text))
            .then(items => items.length ? saveToDB(items) : false)
            .then(() => counter++)
            .catch(err => console.error(`Error while processing content`, err))
            .finally(async () => await browser.close());
    }
})();

