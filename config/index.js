const fs = require('fs');
const path = require('path');

// Determine the environment, default to 'default' if NODE_ENV is not set
const environment = process.env.NODE_ENV || 'default';

// Load the default configuration
const defaultConfig = require('./default.json');

// Try to load the environment-specific configuration
let envConfig = {};
const envConfigPath = path.join(__dirname, `${environment}.json`);
if (fs.existsSync(envConfigPath)) {
    envConfig = require(envConfigPath);
}

// Merge the default configuration with the environment-specific configuration
const finalConfig = { ...defaultConfig, ...envConfig };

module.exports = finalConfig;