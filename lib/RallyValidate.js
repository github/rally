/* eslint no-multi-spaces: ["error", { ignoreEOLComments: true }] */
// Set the config file info and requirements
const configFile = 'rally.yml'
const outdent = require('outdent')
const rally = require('rally')
const yaml = require('js-yaml')

const queryUtils = rally.util.query

class RallyValidate {
  /**
   * Initialize the Probot framework
   *
   * @constructor
   * @param robot
   */
  constructor (robot) {
    this.robot = robot
  }

  /**
   * Sleep for a given period
   *
   * @param ms
   * @returns {Promise<unknown>}
   */
  async sleep (ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

  /**
   * Initialize the Rally client
   *
   * @param config
   * @returns {Promise<void>}
   */
  async initializeRallyClient (config) {
    let rallyServer = process.env.RALLY_SERVER
    let rallyUsername = process.env.RALLY_USERNAME
    let rallyPassword = process.env.RALLY_PASSWORD
    let rallyAPIKey = process.env.RALLY_API_KEY

    if (config.rally) {
      if (config.rally.server) { // Specify the RallyDev URL
        rallyServer = config.rally.server
      }
      if (config.rally.username) { // Rally Username (should be stored elsewhere)
        rallyUsername = config.rally.username
      }
      if (config.rally.password) { // Rally Password, to override global defaults
        rallyPassword = config.rally.password
      }
      if (config.rally.api_key) { // Rally API key, to override global default
        rallyAPIKey = config.rally.api_key
      }
      if (!config.rally.projects || config.rally.projects.length < 1) {
        config.rally.projects = ['Any']
      }
    }

    const rallyClient = rally({
      user: rallyUsername, // Required if no api key, defaults to process.env.RALLY_USERNAME
      pass: rallyPassword, // Required if no api key, defaults to process.env.RALLY_PASSWORD
      apiKey: rallyAPIKey, // Preferred, required if no user/pass, defaults to process.env.RALLY_API_KEY
      apiVersion: 'v2.0',  // This is the default and may be omitted
      server: rallyServer, // This is the default and may be omitted
      requestOptions: {
        headers: {
          'X-RallyIntegrationName': 'Rally + GitHub', // while optional, it is good practice to
          'X-RallyIntegrationVendor': 'GitHub, Inc',  // provide this header information
          'X-RallyIntegrationVersion': '1.0'
        }
        // any additional request options (proxy options, timeouts, etc.)
      }
    })

    return rallyClient
  }

  /**
   * Get the default config from the org-level repo
   *
   * @param context
   * @returns {Promise<{}>}
   */
  async getDefaultConfig (context) {
    const noFile = true
    const orgConfigRepoName = process.env.ORG_CONFIG_REPO_NAME ? process.env.ORG_CONFIG_REPO_NAME : '.github'
    let orgConfig

    // Get config default from org-level repo .github/rally/<REPO_NAME>.yml
    let orgConfigResponse = await context.github.repos.getContents({
      owner: context.payload.repository.owner.login,
      repo: orgConfigRepoName,
      path: '.github/rally/' + context.payload.repository.name + '.yml'
    })
      .catch(() => ({ // Failed to find or open any default config file
        noFile
      }))

    // Fall back to the default org-level config .github/rally.yml
    if (orgConfigResponse.noFile) {
      this.robot.log.info('NOTE: config file not found in: ' + orgConfigRepoName + '/.github/rally/' + context.payload.repository.name + '.yml.')
      orgConfigResponse = await context.github.repos.getContents({
        owner: context.payload.repository.owner.login,
        repo: orgConfigRepoName,
        path: '.github/' + configFile
      })
        .catch(() => ({ // Failed to find or open any default config file
          noFile
        }))
    }

    if (orgConfigResponse.noFile) {
      this.robot.log.info('NOTE: config file not found in: ' + orgConfigRepoName + '/.github/' + configFile + '.')
      orgConfig = {}
    } else {
      // Config file found, need to parse variables
      const orgConfigString = Buffer.from(orgConfigResponse.data.content, 'base64').toString('ascii')
      orgConfig = yaml.load(orgConfigString)
    }

    return orgConfig
  }

  /**
   * Process the pull request
   *
   * @param context
   * @returns {Promise<void>}
   */
  async handlePullRequest (context) {
    await this.handlePullRequestWithRally (context, this.initializeRallyClient)
  }

  /**
   * Process the pull request with the given initializeRallyClient
   *
   * @param context
   * @param _initializeRallyClient
   * @returns {Promise<void>}
   */
  async handlePullRequestWithRally(context, _initializeRallyClient) {
    // Initialize Rally Artifacts
    const rallyArtifacts = {}

    this.robot.log.debug(context)

    // Get our config file
    const defaultConfig = await this.getDefaultConfig(context)
    const config = await context.config(configFile, defaultConfig)
    // Confirm that the config file exists
    if (!config) {
      // Check environment variable to see whether we need to enforce on this repository
      if (process.env.ENFORCE_ALL_REPOS === 'true') {
        await this.setStatusFail(context, this.createNoConfigMessage())
      }
      return
    }

    this.robot.log.debug('Final Config:', config)

    // Set the status to in_progress
    await this.setStatusPending(context, config)

    try {
      const rallyClient = await _initializeRallyClient(config)
      // Get commit comments for validation
      rallyArtifacts.commits = await this.checkCommitMessages(context, config, rallyClient)
      // Get the PR title for validation
      rallyArtifacts.titleList = await this.checkPRTitle(context, config, rallyClient)
      // Get the PR body for validation
      rallyArtifacts.bodyList = await this.checkPRBody(context, config, rallyClient)

      await this.updateRallyConnections(rallyClient, rallyArtifacts, context.payload.pull_request, config)
    } catch (e) {
      await this.setStatusFail(context, config, 'Error occurred while validating Rally Artifacts: ' + e)
      this.robot.log.error(e)
      return
    }

    // Set the status message
    const { statusMessage, isSuccess } = await this.processArtifacts(config, rallyArtifacts)
    // Set the check status based on Rally artifact validation
    if (isSuccess) {
      await this.setStatusPass(context, config, statusMessage)
    } else {
      await this.setStatusFail(context, config, statusMessage)
    }

    if (config.commentOnPull) {
      // Comment on the PR
      await this.commentOnPull(context, statusMessage)
    }
  }

  /**
   * Process the closed pull request
   *
   * @param context
   * @returns {Promise<void>}
   */
  async handlePullRequestClosed (context) {
    // Only close Rally Artifacts if PR is merged
    if (context.payload.pull_request.merged === false) {
      return
    }

    const defaultConfig = await this.getDefaultConfig(context)
    const config = await context.config(configFile, defaultConfig)

    if (!config) {
      // Check environment variable to see whether we need to enforce on this repository
      if (process.env.ENFORCE_ALL_REPOS === 'true') {
        await this.setStatusFail(context, config, this.createNoConfigMessage())
      }
      return
    }

    const rallyClient = await this.initializeRallyClient(config)
    this.closeArtifactsFromPRBody(context, config, rallyClient)
  }

  /**
   * Create the status message for the checks
   *
   * @param checkPRBody
   * @param checkPRTitle
   * @param checkCommitMessages
   * @param statuses
   * @param projects
   * @param bodyMessage
   * @param titleMessage
   * @param commitsMessage
   * @returns {*|string}
   */
  createStatusMessage ({ checkPRBody, checkPRTitle, checkCommitMessages, statuses, projects, bodyMessage, titleMessage, commitsMessage }) {
    return outdent`This repository requires a valid Rally artifact to be present in the following portions of this pull before merge will be allowed:

    ${checkPRBody}
    ${checkPRTitle}
    ${checkCommitMessages}

    _Valid artifact states for this repository_:

    ${statuses}

    _Valid projects for this repository_

    ${projects}

    ${bodyMessage}
    ${titleMessage}
    ${commitsMessage}
    `
  }

  /**
   * Process the artifacts that have been found in the pull request
   *
   * @param config
   * @param rallyArtifacts
   * @returns {Promise<{statusMessage: (*|string), isSuccess: boolean}>}
   */
  async processArtifacts (config, rallyArtifacts) {
    const statuses = [...new Set(config.rally.states.map(status => `- [x] \`${status}\``))]
    const projects = [...new Set(config.rally.projects.map(project => `- [x] \`${project}\``))]

    const statusMessageOptions = {
      checkPRBody: config.checkPRBody ? '- [x] Pull Request Body' : '- [ ] Pull Request Body',
      checkPRTitle: config.checkPRTitle ? '- [x] Pull Request Title' : '- [ ] Pull Request Title',
      checkCommitMessages: config.checkCommitMessages ? '- [x] Commit Messages' : '- [ ] Commit Messages',
      statuses: statuses.join('\n'),
      projects: projects.join('\n')
    }

    let bodyResult = {
      message: '',
      isSuccess: true
    }
    let titleResult = {
      message: '',
      isSuccess: true
    }
    let commitsResult = {
      message: '',
      isSuccess: true
    }

    if (config.checkPRBody) {
      bodyResult = await this.formatBodyMessage(config, rallyArtifacts.bodyList)
    }
    if (config.checkPRTitle) {
      titleResult = await this.formatTitleMessage(config, rallyArtifacts.titleList)
    }
    if (config.checkCommitMessages) {
      commitsResult = await this.formatCommitsMessage(config, rallyArtifacts.commits.commitsWithArtifact, rallyArtifacts.commits.commitsWithoutArtifact)
    }

    const isSuccess = (bodyResult.isSuccess && titleResult.isSuccess && commitsResult.isSuccess)

    Object.assign(statusMessageOptions, {
      bodyMessage: bodyResult.message,
      titleMessage: titleResult.message,
      commitsMessage: commitsResult.message
    })

    const statusMessage = this.createStatusMessage(statusMessageOptions)

    return { statusMessage, isSuccess }
  }

  /**
   * Pull Request Body
   *
   * Format the check body and/or pull request comment body
   * with the status of the PR body validation
   *
   * @param config
   * @param bodyList
   */
  async formatBodyMessage (config, bodyList) {
    // Default isSuccess to true, then set to fail if matches fail
    let isSuccess = true
    // Set the content headers
    let message = '\n### Pull Request body validation\n'
    // Format the message for the PR body
    if (bodyList && bodyList.length > 0) {
      message += 'The following Rally artifacts have been found in the body of this pull request, with validation status below\n\n'
      message += '| Artifact | Rally Status | Project | Validation |\n'
      message += '| --- | --- | --- | --- | \n'
      bodyList.forEach(artifact => {
        if (!artifact.isValid) { isSuccess = false }
        // Append the status to the PR comment
        message += `| ${artifact.key} | \`${artifact.status}\` | \`${artifact.projectName}\` | ${artifact.statusIcon} \`${artifact.validState}\` |\n`
      })
    } else {
      message += '\n:heavy_exclamation_mark: No valid artifacts were found in the pull request body'
      isSuccess = false
    }
    return { message, isSuccess }
  }

  /**
   * Pull Request Title
   *
   * Format the check body and/or pull request comment body
   * with the status of the PR title validation
   *
   * @param config
   * @param bodyList
   */
  async formatTitleMessage (config, titleList) {
    // Default isSuccess to true, then set to fail if matches fail
    let isSuccess = true
    // Set the content headers
    let message = '\n### Pull Request title validation\n'
    // Format the message for PR title
    if (titleList && titleList.length > 0) {
      message += 'The following Rally artifacts have been found in the title of this pull request, with validation status below\n\n'
      message += '| Artifact | Rally Status | Project | Validation |\n'
      message += '| --- | --- | --- | --- |\n'
      titleList.forEach(artifact => {
        if (!artifact.isValid) { isSuccess = false }
        // Append the status to the PR comment
        message += `| ${artifact.key} | \`${artifact.status}\` | \`${artifact.projectName}\` | ${artifact.statusIcon} \`${artifact.validState}\` |\n`
      })
    } else {
      message += '\n:heavy_exclamation_mark: No valid artifacts were found in the pull request title'
      isSuccess = false
    }
    return { message, isSuccess }
  }

  /**
   * Pull Request Title
   *
   * Format the check body and/or pull request comment body
   * with the status of the commit message validation
   *
   * @param config
   * @param commitsWithArtifact
   * @param commitsWithoutArtifact
   */
  async formatCommitsMessage (config, commitsWithArtifact = [], commitsWithoutArtifact = []) {
    // Default isSuccess to true, then set to fail if matches fail
    let isSuccess = true

    // Set the content headers
    let message = '\n### Commit validation\n'
    message += '| Artifact | Commit SHA | Rally Status | Project | Validation |\n'
    message += '| --- | --- | --- | --- | --- |\n'
    // Process commits with Rally artifacts in them
    commitsWithArtifact.forEach(artifact => {
      if (!artifact.rally.isValid) { isSuccess = false }
      // Append the status to the PR comment
      message += `| ${artifact.rally.key} | [${artifact.sha_short}](${artifact.commit_url}) | \`${artifact.rally.status}\` | \`${artifact.rally.projectName}\` | ${artifact.rally.statusIcon} \`${artifact.rally.validState}\` |\n`
    })
    // Process commits without Rally artifacts
    if (commitsWithoutArtifact && commitsWithoutArtifact.length > 0) {
      let commitsColumn = ''
      commitsWithoutArtifact.forEach(commit => {
        commitsColumn += `[${commit.sha_short}](${commit.commit_url})<br>`
      })
      message += `| \`missing\` | ${commitsColumn} | \`missing\` | \`missing\` | :heavy_exclamation_mark: \`failed\` |\n`
      message += '\n**Note:** You can [amend your commit message](https://help.github.com/en/github/committing-changes-to-your-project/changing-a-commit-message) if needed\n\n'
      isSuccess = false
    }
    return { message, isSuccess }
  }

  /**
   * Comment on the pull request with the same message we have in the checks tab
   *
   * @param context
   * @param message
   * @returns {Promise<void>}
   */
  async commentOnPull (context, message) {
    await context.github.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.pull_request.number,
      body: message
    })
  }

  /**
   * Check commit messages for Rally artifacts
   *
   * @param context
   * @param config
   * @param rallyClient
   * @returns {Promise<{commitsWithoutArtifact: [], commitsWithArtifact: []}>}
   */
  async checkCommitMessages (context, config, rallyClient) {
    const commitsWithArtifact = []
    const commitsWithoutArtifact = []
    // Only check commit messages if specified in the config
    if (config.checkCommitMessages) {
      // Get the URL for the pull request
      const commitsUrl = context.payload.pull_request.html_url
      // Get all the commits in the pull request
      const compare = await context.github.repos.compareCommits(context.repo({
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha
      }))

      // Check that every commit message has a Rally artifact in it
      for (const data of compare.data.commits) {
        const rallyArtifact = this.findArtifact(data.commit.message, config.rally.objects)
        const commitStatus = {
          sha: data.sha,
          message: data.commit.message,
          sha_short: data.sha.substr(0, 6),
          commit_url: `${commitsUrl}/commits/${data.sha}`,
          rally: await this.validateArtifact(rallyClient, rallyArtifact[0], 'commitMessages', context.payload.pull_request, config)
        }
        // Group commits with keys and those without
        if (commitStatus.rally) {
          commitsWithArtifact.push(commitStatus)
        } else {
          commitsWithoutArtifact.push(commitStatus)
        }
      }
    }
    return {
      commitsWithArtifact: commitsWithArtifact,
      commitsWithoutArtifact: commitsWithoutArtifact
    }
  }

  /**
   * Check the pull request title for Rally artifacts
   *
   * @param context
   * @param config
   * @param rallyClient
   * @returns {Promise<*[]|({artifact: *, validState: *, isValid: *, property: *, statusIcon: *, projectName: *, key: *, status: *}|undefined)[]>}
   */
  async checkPRTitle (context, config, rallyClient) {
    if (config.checkPRTitle) {
      // Look for artifact keys in the PR title
      const artifactKeys = this.findArtifact(context.payload.pull_request.title, config.rally.objects)
      if (artifactKeys) { // validate each key we find
        return Promise.all(artifactKeys.map(artifactKey => {
          return this.validateArtifact(rallyClient, artifactKey, 'prTitle', context.payload.pull_request, config)
        }))
      } else {
        this.robot.log.debug('No artifact found in PR title')
      }
    }
    return []
  }

  /**
   * Check the pull request body for Rally artifacts
   *
   * @param context
   * @param config
   * @param rallyClient
   * @returns {Promise<*[]|({artifact: *, validState: *, isValid: *, property: *, statusIcon: *, projectName: *, key: *, status: *}|undefined)[]>}
   */
  async checkPRBody (context, config, rallyClient) {
    if (config.checkPRBody) {
      // Look for artifact keys in the PR body
      const artifactKeys = this.findArtifact(context.payload.pull_request.body, config.rally.objects)
      if (artifactKeys) { // validate each key we find
        return Promise.all(artifactKeys.map(artifactKey => {
          return this.validateArtifact(rallyClient, artifactKey, 'prBody', context.payload.pull_request, config)
        }))
      } else {
        this.robot.log.debug('No artifact found in PR body')
      }
    }
    return []
  }

  /**
   * Respond to the `/completes` command in a pull request body
   *
   * @param context
   * @param config
   * @param rallyClient
   * @returns {Promise<void[]>}
   */
  async closeArtifactsFromPRBody (context, config, rallyClient) {
    if (config.mergeOnPRBody) {
      // Look for artifact keys in the PR body
      const artifactKeys = this.findPromotionArtifact(context.payload.pull_request.body, config.rally.objects, ['completes'])
      if (artifactKeys) { // close on each key we find
        return Promise.all(artifactKeys.map(artifactKey => {
          return this.promoteArtifact(rallyClient, artifactKey, config)
        }))
      } else {
        this.robot.log.debug('No artifact found in PR body')
      }
    }
  }

  /**
   * Set the checks status to 'Pending'
   *
   * @param context
   * @param config
   * @returns {Promise<*>}
   */
  async setStatusPending (context, config) {
    return context.github.checks.create(context.repo({
      name: config.checksName,
      head_branch: context.payload.pull_request.head.ref,
      head_sha: context.payload.pull_request.head.sha,
      status: 'in_progress',
      started_at: new Date(),
      output: {
        title: 'Rally validation is in progress...',
        summary: 'We\'re currently validating the status of any Rally artifacts associated with this pull request. Please stand by.'
      }
    }))
  }

  /**
   * Override the failed check
   *
   * @param context
   * @param config
   * @returns {Promise<*>}
   */
  async setOverridePass (context, config) {
    const timeStart = new Date()
    return context.github.checks.create(context.repo({
      name: config.checksName,
      head_branch: context.payload.check_run.check_suite.head_branch,
      head_sha: context.payload.check_run.head_sha,
      status: 'completed',
      started_at: timeStart,
      conclusion: 'success',
      completed_at: new Date(),
      output: {
        title: 'Rally artifact validation manually overridden by @' + context.payload.sender.login,
        summary: 'Commit sign-off was manually approved by @' + context.payload.sender.login
      }
    }))
  }

  /**
   * Set the checks status to 'Passed'
   *
   * @param context
   * @param config
   * @param statusMessage
   * @returns {Promise<*>}
   */
  async setStatusPass (context, config, statusMessage = 'All Rally artifacts have been validated!') {
    const timeStart = new Date()
    return context.github.checks.create(context.repo({
      name: config.checksName,
      head_branch: context.payload.pull_request.head.ref,
      head_sha: context.payload.pull_request.head.sha,
      status: 'completed',
      started_at: timeStart,
      conclusion: 'success',
      completed_at: new Date(),
      output: {
        title: 'Rally artifacts have been validated',
        summary: statusMessage
      }
    }))
  }

  /**
   * Set the checks status to 'Failed'
   *
   * @param context
   * @param config
   * @param statusMessage
   * @returns {Promise<*>}
   */
  async setStatusFail (context, config, statusMessage = 'Please provide a valid Rally artifact') {
    const timeStart = new Date()
    return context.github.checks.create(context.repo({
      name: config.checksName,
      head_branch: context.payload.pull_request.head.ref,
      head_sha: context.payload.pull_request.head.sha,
      status: 'completed',
      started_at: timeStart,
      conclusion: 'failure',
      completed_at: new Date(),
      output: {
        title: 'Rally artifact validation failed',
        summary: statusMessage
      }
    }))
  }

  /**
   * Create the message that notifies users they are missing the config file
   *
   * @returns {string}
   */
  createNoConfigMessage () {
    let noConfigMessage = 'No config file exists in this repository. Please create a valid config file at `.github/rally.yml`\n\nExample config file:\n\n'

    noConfigMessage += `---
    # Name of the GitHub Check
    checksName: integrations/rally

    # Check PR Body for Rally artifact
    checkPRBody: true

    # Check PR Title for Rally artifact
    checkPRTitle: true

    # Check all commit messages for a Rally artifact
    checkCommitMessages: true

    # Comment on the PR in addition to the check message?
    commentOnPull: false"
    
    rally:
      server: https://rally1.rallydev.com
    
      ## Leave these blank if you use an API key
      ##username: rallyUser
      ##password: rallyPass
      ## This is required if we don't use username/password
      ## NOTE: If you set this in your .env file then you can
      ## leave this commented out. It will override your .env
      #api_key: _1234abc567...
    
      # Which workspace OID this repo will link to
      workspace: 12345
    
      # Which projects this repo will link to.
      # To have it connect to any project, leave this value blank
      projects:
        - Sample Project
        - devops-engineering
    
      # List of valid Rally objects to check
      objects:
        - defect
        #- defectsuite
        #- task
        #- testcase
        #- hierarchicalrequirement
        - userstory
        #- story
    
      # List of Rally states that an issue must be in in order to pass
      states:
        - Defined
        - In-Progress
    `
    return noConfigMessage
  }

  /**
   * Get all unique artifact prefixes based on the requested artifactTypes
   *
   * @param text
   * @param artifactTypes
   * @returns {[]}
   */
  findArtifact (text, artifactTypes) {
    let artifacts = []
    let prefixes = []
    const prefixMapping = {
      defect: ['D', 'DE'],
      defectsuite: ['DS'],
      task: ['TA'],
      testcase: ['TC'],
      hierarchicalrequirement: ['S', 'US'],
      userstory: ['S', 'US'],
      story: ['S', 'US']
    }
    artifactTypes.forEach((type) => {
      const newPrefixes = prefixMapping[type]
      prefixes = prefixes.concat(newPrefixes)
    })
    prefixes = [...new Set(prefixes)]

    prefixes.forEach(prefix => {
      const regexp = RegExp('\\b' + prefix + '[0-9]{1,10}\\b', 'gi')
      const artifactMatches = text.match(regexp)
      if (artifactMatches) {
        artifacts = artifacts.concat(artifactMatches)
      }
    })
    return artifacts
  }

  /**
   * Discover Rally artifacts that will be transitioned with commands
   *
   * @param text
   * @param artifactTypes
   * @param promotionCommands
   * @returns {[]}
   */
  findPromotionArtifact (text, artifactTypes, promotionCommands) {
    let artifacts = []

    // Get all unique artifact prefixes based on the requested artifactTypes
    let prefixes = []
    const prefixMapping = {
      defect: ['D', 'DE'],
      defectsuite: ['DS'],
      task: ['TA'],
      testcase: 'TC',
      hierarchicalrequirement: ['S', 'US'],
      userstory: ['S', 'US'],
      story: ['S', 'US']
    }
    artifactTypes.forEach((type) => {
      const newPrefixes = prefixMapping[type]
      prefixes = prefixes.concat(newPrefixes)
    })
    prefixes = [...new Set(prefixes)]

    if (promotionCommands && promotionCommands.length > 0) {
      promotionCommands.forEach(command => {
        prefixes.forEach(prefix => {
          const regexp = RegExp('/' + command + ' ' + prefix + '[0-9]{1,10}\\b', 'gi')
          const matches = text.match(regexp)
          if (matches) {
            const artifactMatches = matches.map(match => {
              const artifactMatch = {
                command: command,
                artifact: match.substr(command.length + 2)
              }
              return artifactMatch
            })
            artifacts = artifacts.concat(artifactMatches)
          }
        })
      })
    }
    return artifacts
  }

  /**
   * Re-run a failed check
   *
   * @param context
   * @param config
   * @returns {Promise<void>}
   */
  async rerunCheck (context) {
    const prContext = context

    const defaultConfig = await this.getDefaultConfig(context)
    const config = await context.config(configFile, defaultConfig)
    if (!config) {
      await this.setStatusFail(context, this.createNoConfigMessage())
    }

    let prNumber
    if (context.name === 'check_suite') {
      prNumber = context.payload.check_suite.pull_requests[0].number
      const appId = context.payload.check_suite.app.id
      if (appId !== process.env.APP_ID) {
        return
      }
    } else {
      prNumber = context.payload.check_run.check_suite.pull_requests[0].number
      const checkName = context.payload.check_run.name
      if (checkName !== config.checksName) {
        return
      }
    }

    const prResponse = await context.github.pulls.get({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: prNumber
    })
    prContext.payload.pull_request = prResponse.data

    this.handlePullRequest(prContext)
  }

  /**
   * Parse the pull request to find Rally artifacts
   *
   * @param artifactName
   * @returns {{}}
   */
  parseArtifact (artifactName) {
    const artifact = {}
    const typeMapping = {
      D: 'defect',
      DE: 'defect',
      DS: 'defectsuite',
      TA: 'task',
      TC: 'testcase',
      S: 'hierarchicalrequirement',
      US: 'hierarchicalrequirement'
    }

    artifact.prefix = artifactName.match(/([A-Z]{1,2})/i)[0]
    artifact.number = artifactName.match(/[1-9].*/)[0]
    artifact.rallyType = typeMapping[artifact.prefix]

    return artifact
  }

  /**
   * Validate that the discovered Rally object exists and is in the correct state.
   *
   * @param rallyClient
   * @param key
   * @param property
   * @param pr
   * @param config
   * @returns {Promise<{artifact, validState: string, isValid: *, property: *, statusIcon, projectName: string, key: *, status: string}>}
   */
  async validateArtifact (rallyClient, key, property, pr, config) {
    try {
      if (key !== null && key !== undefined) {
        const githubArtifact = this.parseArtifact(key)
        const queryResponse = await rallyClient.query({
          type: githubArtifact.rallyType,
          start: 1,
          pageSize: 2,
          limit: 20,
          order: 'Rank',
          scope: {
            workspace: '/workspace/' + config.rally.workspace
          },
          fetch: ['FormattedID', 'Name', 'Description', 'ScheduleState', 'Project', 'Connections'],
          query: queryUtils.where('FormattedID', '=', githubArtifact.number),
          requestOptions: {}
        })

        let status
        let projectName
        let validProject
        let validState
        let statusIcon
        let isValid
        if (queryResponse.TotalResultCount === 0) {
          status = 'Not Found'
          projectName = 'Not Found'
          validState = 'failed'
          statusIcon = ':heavy_exclamation_mark:'
        } else {
          const artifact = queryResponse.Results[0]
          status = artifact.ScheduleState
          projectName = artifact.Project._refObjectName
          validProject = (config.rally.projects.includes('Any') || config.rally.projects.includes(projectName))
          isValid = (config.rally.states.includes(status) && validProject)
          validState = isValid ? 'passed' : 'failed'
          statusIcon = isValid ? ':heavy_check_mark:' : ':heavy_exclamation_mark:'
        }

        const artifactStatus = {
          key: key,
          property: property,
          status: status,
          projectName: projectName,
          isValid: isValid,
          validState: validState,
          statusIcon: statusIcon,
          artifact: queryResponse.Results[0]
        }
        return artifactStatus
      }
    } catch (e) {
      this.robot.log.error(e)
      throw e
    }
  }

  /**
   * Set the Rally object to a specific state when the Pull Request merges.
   * Default: 'Completed'
   *
   * @param rallyClient
   * @param artifact
   * @param config
   * @returns {Promise<void>}
   */
  async promoteArtifact (rallyClient, artifact, config) {
    try {
      const key = artifact.artifact
      if (key !== null && key !== undefined) {
        const githubArtifact = this.parseArtifact(key)
        const queryResponse = await rallyClient.query({
          type: githubArtifact.rallyType,
          start: 1,
          pageSize: 2,
          limit: 20,
          order: 'Rank',
          scope: {
            workspace: '/workspace/' + config.rally.workspace
          },
          fetch: ['FormattedID', 'Name', 'Description', 'ScheduleState', 'Project'],
          query: queryUtils.where('FormattedID', '=', githubArtifact.number),
          requestOptions: {}
        })
        if (queryResponse.TotalResultCount !== 0) {
          await this.setArtifactScheduleState(rallyClient, queryResponse.Results[0]._ref, 'Completed')
        }
      }
    } catch (e) {
      this.robot.log.error(e)
      throw e
    }
  }

  /**
   * Update the Rally artifact to contain this pull request as a Connection
   *
   * @param rallyClient
   * @param rallyArtifacts
   * @param pr
   * @param config
   * @returns {Promise<void>}
   */
  async updateRallyConnections (rallyClient, rallyArtifacts, pr, config) {
    let commitList = []
    if (rallyArtifacts.commits) {
      if (rallyArtifacts.commits.commitsWithArtifact) {
        if (Array.isArray(rallyArtifacts.commits.commitsWithArtifact)) {
          commitList = rallyArtifacts.commits.commitsWithArtifact.map(commit => commit.rally)
        }
      }
    }

    const allArtifacts = [...commitList, ...rallyArtifacts.titleList, ...rallyArtifacts.bodyList]
    const validArtifacts = allArtifacts.filter(artifact => artifact.isValid)

    // get a set of Artifacts with unique key value
    const uniqueArtifacts = []
    const map = new Map()
    for (const artifact of validArtifacts) {
      if (!map.has(artifact.key)) {
        map.set(artifact.key, true)
        uniqueArtifacts.push(artifact)
      }
    }

    // Get a list of all PRs for this artifact
    await uniqueArtifacts.forEach(async artifact => {
      const queryResponse = await rallyClient.query({
        ref: artifact.artifact.Connections._ref,
        start: 1,
        pageSize: 2,
        limit: 20,
        scope: {
          workspace: '/workspace/' + config.rally.workspace
        },
        fetch: ['Url'],
        requestOptions: {}
      })
      // Add this PR to the artifact if it hasn't already been added
      if (!queryResponse.Results.some(result => result.Url === pr.html_url)) {
        this.createRallyPullRequest(rallyClient, artifact.artifact._ref, pr)
      }
    })
  }

  /**
   * Create the Pull Request connection in Rally
   *
   * @param rallyClient
   * @param ref
   * @param pr
   * @returns {Promise<void>}
   */
  async createRallyPullRequest (rallyClient, ref, pr) {
    try {
      await rallyClient.create({
        type: 'pullrequest',
        data: {
          ExternalID: pr.number,
          ExternalFormattedId: pr.number,
          Artifact: ref,
          Name: pr.title,
          Url: pr.html_url
        },
        requestOptions: {}
      })
    } catch (e) {
      // Ignore Invalid key error. It's an uncaught error that should be handled in the Rally wrapper, but isn't.
      if (!e.toString().includes('Invalid key')) {
        this.robot.log.error(e)
        throw e
      }
    }
  }

  /**
   *
   * @param rallyClient
   * @param ref
   * @param state
   * @returns {Promise<void>}
   */
  async setArtifactScheduleState (rallyClient, ref, state) {
    try {
      const validStates = ['Defined', 'In-Progress', 'Completed', 'Accepted']
      if (!validStates.includes(state)) {
        throw new Error('State:', state, 'is not a valid value')
      }
      const updateResponse = await rallyClient.update({
        ref: ref,
        data: {
          ScheduleState: state
        },
        requestOptions: {}
      })
      this.robot.log.debug('Update Response: ', updateResponse)
    } catch (e) {
      // Ignore Invalid key error. It's an uncaught error that should be handled in the Rally wrapper, but isn't.
      if (!e.toString().includes('Invalid key')) {
        this.robot.log.error(e)
        throw e
      }
    }
  }
}

// Load the Library
module.exports = RallyValidate
