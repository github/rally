const RallyValidate = require('../lib/RallyValidate')

const yaml = require('js-yaml')
const fs = require('fs')

const validPR = require('./fixtures/valid_pull_request')

describe('JiraIssueValidate', () => {
  let robot
  let handler
  let context
  beforeEach(() => {
    robot = {
      log: {
        debug: jest.fn(),
        error: jest.fn()
      }
    }

    handler = new RallyValidate(robot)

    const configFile = yaml.safeLoad(fs.readFileSync('./probot-rally.yml'))

    context = {
      config: jest.fn().mockImplementation(() => Promise.resolve(configFile)),
      github: {
        checks: {
          create: jest.fn()
        },
        repos: {
          compareCommits: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              commits: [
                {
                  commit: {
                    message: 'hello!'
                  },
                  sha: '1234lkajsdfkjsdf'
                }
              ]
            }
          }))
        }
      },
      repo: jest.fn().mockImplementation((input) => { return input })
    }
  })

  describe('get configuration', () => {
    beforeEach(() => {
      context.payload = {
        pull_request: validPR
      }
    })
    it('requests config file from repository', async () => {
      await handler.handlePullRequest(context)
      expect(context.config).toHaveBeenCalled()
    })

    it('doesn\'t run when config is empty and ENFORCE_ALL_REPOS is false', async () => {
      context.config = jest.fn().mockImplementation(() => Promise.resolve(undefined))
      process.env.ENFORCE_ALL_REPOS = false
      await handler.handlePullRequest(context)
      expect(context.github.checks.create).not.toHaveBeenCalled()
    })

    it('returns fail status when config is empty and ENFORCE_ALL_REPOS is true', async () => {
      context.config = jest.fn().mockImplementation(() => Promise.resolve(undefined))
      process.env.ENFORCE_ALL_REPOS = true
      await handler.handlePullRequest(context)
      expect(context.github.checks.create).toHaveBeenCalledWith(expect.objectContaining({
        conclusion: 'failure'
      }))
    })
  })
})
