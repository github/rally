const RallyValidate = require('./lib/RallyValidate')
const bodyParser = require('body-parser');
const express = require('express')
const path = require('path')

const { writeConfig, config } = require('./lib/setup');

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
  const fields = Object.keys(config).map(key => ({ key, value: config[key] }))

  const router = app.route('/setup')

  /*
   * Serve everything under <approot>/public as static content
   * http://127.0.0.1:3000/rally/css/main.css will serve the file
   * from <approot>/public/css/main.css
   */
  router.use(express.static(path.join(__dirname, 'public')))
  router.use(bodyParser.urlencoded({ extended: true }))

  router.get('/', (_, res) => {
    res.render(index, { title, config: fields })
  });

  router.post('/', (req, res) => {
    const newConfig = {
      ...config,
      ...req.body
    }

    writeConfig(newConfig)
    const newFields = Object.keys(newConfig).map(key => ({ key, value: newConfig[key] }))

    console.log(newFields)

    res.render(index, { title, config: newFields })
  })
};
