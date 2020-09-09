const RallyValidate = require('./lib/RallyValidate')
const bodyParser = require('body-parser')
const express = require('express')
const path = require('path')

const { writeConfig, readConfig, getVarConfig } = require('./lib/setup')

/**
 * Resolve a template path by basename in the `views` directory
 *
 * Probot already sets a template path so we need a way to
 * resolve where our custom templates are so we can pass a
 * full path to res.render in our routes.
 *
 * Example:
 * getTemplatePath('index') will resolve to <approot>/views/index
 * 
 * The .hbs extension is implied
 *
 * @param {string} name
 * @returns {string} calculated filepath to template
 */
function getTemplatePath(name) {
  return path.join(__dirname, 'views', name)
}

/**
 * Null/empty check
 * 
 * See https://stackoverflow.com/a/3215653
 * @param {*} e 
 */
function isEmpty(e) {
  if (typeof(e) === "string") {
    e = e.trim();
  }

  switch (e) {
    case "":
    case 0:
    case "0":
    case null:
    case false:
    case typeof(e) == "undefined":
      return true;
    default:
      return false;
  }
}

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  const handler = new RallyValidate(app)

  app.on(['pull_request.opened', 'pull_request.edited',
    'pull_request.reopened', 'pull_request.ready_for_review'],
  async context => handler.handlePullRequest(context))

  app.on(['check_run.rerequested', 'check_suite.rerequested'], async context => handler.rerunCheck(context))
  app.on('pull_request.closed', async context => handler.handlePullRequestClosed(context))

  const index = getTemplatePath('setup')
  const title = 'Rally + GitHub: Setup'

  const router = app.route('/setup')

  /*
   * Serve everything under <approot>/public as static content
   * http://127.0.0.1:3000/rally/css/main.css will serve the file
   * from <approot>/public/css/main.css
   */
  router.use(express.static(path.join(__dirname, 'public')))
  router.use(bodyParser.urlencoded({ extended: true }))

  // only allow accessing from localhost, need to combine this with CSRF protection
  router.use((req, res, next) => {
    const { remoteAddress } = req.socket;

    if (remoteAddress === '127.0.0.1' || remoteAddress === '::1' | remoteAddress === '::ffff:127.0.0.1') {
      next()
      return
    }

    res.writeHead(404)
    res.end()
  });

  router.get('/', (_, res) => {
    const currentConfig = readConfig()
    const form = getVarConfig()
    res.render(index, { title, form, config: currentConfig, valid: true })
  })

  router.post('/', (req, res) => {
    const currentConfig = readConfig()
    const form = getVarConfig()
    let valid = true;
    const flash = { status: 'success', message: 'Configuration saved.' };

    const newConfig = {
      ...currentConfig,
      ...req.body
    }

    // Iterate over field config to check for empty values on required fields
    for (const fields of form) {
      if (fields.required) {
        const value = newConfig[fields.env]
        if (isEmpty(value)) {
          fields.errored = isEmpty(value)
          valid = false
        }
      }
    }

    if (valid) {
      writeConfig(newConfig)
    } else {
      flash.status = 'error'
      flash.message = 'Configuration invalid. See errors below.'
    }

    res.render(index, { title, form, config: newConfig, valid, flash })
  })
}
