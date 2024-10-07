const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

// Determine the environment, default to 'default' if NODE_ENV is not set
const environment = process.env.NODE_ENV || 'default'
console.log(`* Current environment: ${environment}`)

// Load the default configuration
const defaultConfig = require('./default.json')
const { log } = require('console')

// Try to load the environment-specific configuration
let envConfig = {};
const envConfigPath = path.join(__dirname, `${environment}.json`)
if (fs.existsSync(envConfigPath)) {
    envConfig = require(envConfigPath)
}

// Merge the default configuration with the environment-specific configuration
const finalConfig = { ...defaultConfig, ...envConfig }

// Loading application-specific YAML configuration
try {
    finalConfig.messages = yaml.load(fs.readFileSync('config/messages.yml', 'utf8'))
} catch (error) {
    console.error('Error loading YAML configuration files:', error)
}

module.exports = finalConfig;