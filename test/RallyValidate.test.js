const RallyValidate = require('../lib/RallyValidate')

const yaml = require('js-yaml')
const fs = require('fs')

const validPR = require('./fixtures/valid_pull_request')
const validRepo = require('./fixtures/valid_repository')
const checkRunRerequested = require('./fixtures/check_run_rerequested')

describe('RallyIssueValidate', () => {
  let robot
  let handler
  let context
  let rallyClient
  beforeEach(() => {
    robot = {
      log: {
        debug: jest.fn(),
        info:  jest.fn(),
        error: jest.fn()
      }
    }

    handler = new RallyValidate(robot)

    const configFile = yaml.load(fs.readFileSync('./rally.yml'))
    const configAllPaths = {...configFile, commentOnPull: true}
    const probotConfigEncodedYaml = Buffer.from(yaml.dump(configAllPaths)).toString('base64')
    context = {
      config: jest.fn().mockImplementation(() => Promise.resolve(configAllPaths)),
      github: {
        checks: {
          create: jest.fn().mockImplementation(() => Promise.resolve(configAllPaths))
        },
        repos: {
          compareCommits: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              commits: [
                {
                  commit: {
                    message: 'fix: US1234 hello!'
                  },
                  sha: '1234lkajsdfkjsdf'
                }
              ]
            }
          })),
          getContents: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              content: probotConfigEncodedYaml
            }
          }))
        },
        pulls: {
          get: jest.fn().mockImplementation(() => Promise.resolve({
            data: validPR
          })),
        },
        issues: {
          createComment: jest.fn().mockImplementation(() => Promise.resolve({}))
        }
      },
      repo: jest.fn().mockImplementation((input) => { return input }),
      payload: {
        pull_request: validPR,
        repository: validRepo
      }
    }

    rallyClient = {
      query: jest.fn().mockImplementation(() => Promise.resolve({
        TotalResultCount: 1,
        Results: [
          {
            _ref: 'https://rallydomain.com/my-ref',
            Project: {
              _refObjectName: 'Sample Project'
            },
            ScheduleState: 'Defined',
            Connections: { _ref: "connections-ref" }
          }
        ]
      })),
      update: jest.fn().mockImplementation(() => Promise.resolve({}))
    }
    initializeRallyClient = jest.fn().mockImplementation(() => Promise.resolve(rallyClient)) // eslint-disable-line
  })

  describe('hook', () => {
    it('pull_request.synchronize', async () => {
      await handler.handlePullRequestWithRally(context, initializeRallyClient) // eslint-disable-line
      expect(context.config).toHaveBeenCalled()
      expect(context.github.checks.create.mock.calls).toEqual([
        [context.repo(expect.objectContaining({
          status: 'in_progress'
        }))],
        [context.repo(expect.objectContaining({
          conclusion: 'success',
          status: 'completed'
        }))]
      ])
    })
  })

  describe('get configuration', () => {
    it('requests config file from repository', async () => {
      await handler.handlePullRequestWithRally(context, initializeRallyClient)
      expect(context.config).toHaveBeenCalled()
    })

    it('doesn\'t run when config is empty and ENFORCE_ALL_REPOS is false', async () => {
      context.config = jest.fn().mockImplementation(() => Promise.resolve(undefined))
      process.env.ENFORCE_ALL_REPOS = 'false'
      await handler.handlePullRequestWithRally(context, initializeRallyClient)
      expect(context.github.checks.create).not.toHaveBeenCalled()
    })

    it('returns fail status when config is empty and ENFORCE_ALL_REPOS is true', async () => {
      context.config = jest.fn().mockImplementation(() => Promise.resolve(undefined))
      process.env.ENFORCE_ALL_REPOS = 'true'
      await handler.handlePullRequestWithRally(context, initializeRallyClient)
      expect(context.github.checks.create).toHaveBeenCalledWith(expect.objectContaining({
        conclusion: 'failure'
      }))
    })
  })

  describe('set artifacts to complete on pr merge', () => {
    it('doesn\'t attempt a status change when mergeOnPRBody is set to false in config', async () => {
      const configFile = yaml.load(fs.readFileSync('./rally.yml'))
      configFile.mergeOnPRBody = false
      await handler.closeArtifactsFromPRBody(context, configFile, rallyClient)
      expect(rallyClient.update).not.toHaveBeenCalled()
    })

    it('sets status to completed when mergeOnPRBody is set to true in config', async () => {
      const configFile = yaml.load(fs.readFileSync('./rally.yml'))
      await handler.closeArtifactsFromPRBody(context, configFile, rallyClient)
      expect(rallyClient.update).toHaveBeenCalled()
    })
  })

  describe('rerequested', () => {
    it('check_run rerequested', async () => {
      context.payload = checkRunRerequested
      context.name = 'check_run'
      await handler.rerunCheckWithRally(context, initializeRallyClient)
      expect(context.config).toHaveBeenCalled()
      expect(context.github.checks.create.mock.calls).toEqual([
        [context.repo(expect.objectContaining({
          "status": "in_progress",
        }))],
        [context.repo(expect.objectContaining({
          "conclusion": "success",
          "status": "completed",
        }))]
      ])
    })
  })
})
