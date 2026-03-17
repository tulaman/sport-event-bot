require('@dotenvx/dotenvx').config()
const config = require('./index')
const fs = require('fs')

// Load CA certificate for production
const caCertificate = fs.readFileSync('./config/ca-certificate.crt');

module.exports = {
  development: {
    dialect: 'sqlite',
    storage: process.env.STORAGE || 'db.sqlite',
    logging: console.log
  },
  production: {
    username: config.DB_USER,
    password: process.env.DB_PASSWORD,
    database: config.DB_NAME,
    host: config.DB_HOST,
    port: config.DB_PORT,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        ca: caCertificate
      }
    },
    logging: false
  }
};