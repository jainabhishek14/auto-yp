"use strict";

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');

const config = require("./config");

const DB_COLLECTION = "chemists";

const MAX_PAGES = 10;

const isProduction = process.env.NODE_ENV === "production";

let dbConn;

const getPhone = async text => {
    const $ = cheerio.load(text);
    const phone = await $(".dt-top-left > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(2) > a:nth-child(1)").attr("href");
    return phone ? phone.replace("tel:","") : "";
}

const initializeConnection = async () => {
    try {
        const db = dbConn || await MongoClient.connect(`mongodb://${config.db.host}:${config.db.port}`, { useUnifiedTopology: true });
        return db.db(config.db.dbName);
    } catch (err) {
        console.error(`Unable to connect to DB`, err);
    }
}

const updateItemInfo = async (id, phone) => {
    const obj = {
        phone,
        processed: true,
        processed_at: new Date().toISOString()
    }
    try {
        console.log(`Updating: ${id}`);
        return await dbConn.collection(DB_COLLECTION).updateOne({_id: id},{ "$set": obj});
    } catch (err) {
        console.error(`Unable to save items`, err);
    }
};


const fetchContents = async (browser, item) => {
    try {
        const page = await browser.newPage();
        await page.goto(item.url, {timeout: 0, waitUntil: 'networkidle2'});
        page.content()
            .then(text => getPhone(text))
            .then(phone => updateItemInfo(item._id, phone))
            .catch(err => console.error(`Error while processing content`, err))
            .finally(async () => await page.close());
    } catch (err) {
        console.error(err);
    }
}

const getItems = async () => {
    return await dbConn.collection(DB_COLLECTION).find({processed: false});
}

const processItem = (browser, item, time) => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => resolve(await fetchContents(browser, item)), time)
    });
}

const initializeProcess = async items => {
    const browser = await puppeteer.launch({
        headless: true, 
        slowMo: isProduction ? 0 : 250,
        timeout: isProduction ? 30000 : 0,
        //   args: [ `--proxy-server=${proxy.protocols[0]}://${proxy.ipAddress}:${proxy.port}` ]
    });
    let counter = 0;
    let pages = 0;
    let batch = 0;
    await items.forEach(async element => {
        if(pages < MAX_PAGES){
            pages++;
            if( await processItem(browser, element, 0)){
                pages--;
                counter++;
                batch--;
            };
        } else {
            batch++;
            if(await processItem(browser, element, 6000 * batch)){
                counter++;
                batch--;
            }
        } 
    });

    if(counter === items.count()){
        await browser.close();
    }
};

(async () => {
    dbConn = await initializeConnection();
    const items = await getItems();
    await initializeProcess(items);
})();

