
const config = {
    db: {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 27017,
        dbName: process.env.DB_NAME || "scraper"
    }
};
module.exports = config;
