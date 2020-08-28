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

function deserialize(env) {
  return dotenv.parse(env)
}

function serialize(env) {
  return env.map(({ key, value }) => `${key}=${value}`).join(os.EOL)
}

exports.config = readConfig()
