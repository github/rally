const dotenv = require('dotenv')
const fs = require('fs')
const os = require('os')
const path = require('path')

/**
 * Read .env and .env.example to pull possible configuration options and their current
 * or default values.
 * 
 * .env overrides what is in .env.example
 */
function readConfig() {
  const exampleRaw = fs.readFileSync(path.join(__dirname, '..', '.env.example'))
  const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'))

  const envExample = deserialize(exampleRaw)
  const env = deserialize(envRaw)

  return {
    ...envExample,
    ...env
  }
}

function writeConfig(env) {
  return fs.writeFileSync(path.join(__dirname, '..', '.env'), serialize(env))
}

function deserialize(env) {
  return dotenv.parse(env)
}

function serialize(env) {
  // Private key must be wrapped in quotes to be read properly
  if (Object.prototype.hasOwnProperty.call(env, 'PRIVATE_KEY')) {
    env['PRIVATE_KEY'] = `"${env['PRIVATE_KEY']}"`
  }

  return Object.keys(env).map(key => `${key}=${env[key]}`).join(os.EOL)
}

exports.writeConfig = writeConfig
exports.config = readConfig()
