# Probot Rally

A **GitHub App** built with [Probot](https://github.com/probot/probot) that can be configured to:

- Check the `title` of a Pull Request for valid **Rally** artifacts
- Check the `body` of a Pull Request for valid **Rally** artifacts
- Check the `labels` of a Pull Request for valid **Rally** artifacts
- Check the `commit messages` of a Pull Request for valid **Rally** artifacts

The **GitHub App** will update the **Checks API** with success/failure as the conditions are met, and provide a detailed report of the artifacts (i.e. defects, user stories) found and their Flow States in **Rally**.

## Get Started

![checks-status](https://user-images.githubusercontent.com/11798972/76283365-07796480-6260-11ea-8a4e-cddec7bc3c9b.png)

### How it Works

Every time a pull request is created or updated, `Probot-rally` will check for the existence of a **Rally User Story** or **Defect** in the `label`, `title`, `body`, or `commit messages`, and then validate that they are in the correct state in **Rally**.

```yml
---
# Name of the GitHub Check
checksName: rally/validator

# Check PR Labels for Rally story/defect (true | false)
checkPRLabels: true

# Check PR Body for Rally story/defect (true | false)
checkPRBody: true

# Check PR Title for Rally story/defect (true | false)
checkPRTitle: true

# Check all commit messages for a Rally story/defect (true | false)
checkCommitMessages: true

# Which projects this repo will link to
rallyProjects: ['Sample Project', 'devops-engineering']

# List of valid Rally artifacts to check
  # Valid values:
    # defect
    # defectsuite
    # task
    # testcase
    # hierarchicalrequirement
    # userstory
    # story
rallyObjects: ['defect', 'userstory']

# List of Rally statuses that an issue must be in in order to pass
artifactStatuses: ['Defined', 'In-Progress']

# Comment on the PR in addition to the check message? (true | false)
commentOnPull: false

rally:
  server: https://rally1.rallydev.com
  # Leave these blank if you use an API key
  #username: rallyUser
  #password: rallyPass
  # This is required if we don't use username/password
  api_key: _1234abc567...
  # Which workspace OID this repo will link to
  workspace: 12345

```

### Creating the GitHub App on your GitHub instance
- On your GitHub instance, visit the `settings` page on the Organization that you want to own the **GitHub** App, and navigate to the `GitHub Apps` section.
  - You can access this page by visiting the following url:
    `https://<MY_GITHUB_HOSTNAME>/organizations/<MY_ORG_NAME>/settings/apps`
- Create a new **GitHub App** with the following settings:
  - **Webhook URL**: URL of the machine on which this app has been deployed (Example: `http://ip.of.machine:3000`)
  - **Homepage URL**: URL of the machine on which this app has been deployed (Example: `http://ip.of.machine:3000`)
  - **Webhook Secret**: The webhook secret that will be or has been defined as an environment variable in your deployment environment as `WEBHOOK_SECRET`
  - **Permissions**:
    - **Checks**: Read & write
    - **Commit statuses**: Read & write
    - **Contents**: Read-only
    - **Metadata**: Read-only
    - **Pull Requests**: Read & write
    - **Issues**: Read & Write
  - **Events**:
    - **Pull request**
    - **Check run**
    - **Check suite**
    - **Push**

- Once these have been configured, select **save** at the bottom of the page to continue
- Make a note of the `APP ID` on your newly-created **GitHub App**. You will need to set this as an environment variable when you configure the app.
- Generate and download a private key from the new App page, and store it in your deployment environment. You can either do this by saving the contents of the key file as the environment variable `PRIVATE_KEY`, or by saving the file directly in the environment and specifying its path with the environment variable `PRIVATE_KEY_PATH`
- After you have created the **GitHub** App, you will need to install it to the desired **GitHub** Organizations.
  - Select `Install App`
  - Select `All Repositories` or the desired repositories you wish to watch

### Deployment

**Probot-Rally** is based on the **Probot** framework and can be deployed as a standard **NodeJS** application. Ensure that **NPM** is installed in your deployment environment. Also ensure that the following environment variables are configured.
**Note:** You can also deploy as a **Docker** container. Please view the [Docker Deployment Doc](https://github.com/github/probot-rally/blob/master/docs/DockerDeploy.md) for more info.

```bash
# Clone repository to local machine
git clone Path-To-Repository.git

# Change directories into code base
cd probot-rally

# Install all dependencies
npm install

# Create the .env configuration file and update with all needed variables
cp .env.example .env
vi .env
# update .env with configuration variables

# Run the bot
npm start

# Run the bot in the background and output to log
# there are other major ways to achieve this...
# https://github.com/unitech/pm2
# https://github.com/github/auto-fork-sync#running-with-systemd
# https://www.npmjs.com/package/forever
nohup npm start 2>&1 >> /path/to/output.log &
```

### Environment Variables

- `APP_ID` - The App ID of the **GitHub App**
- `GHE_HOST` - This is a required field for **GitHub Enterprise Server** implementations (_Example: github.mycompany.com_)
- `WEBHOOK_SECRET` - The secret to prevent man in the middle attacks
- `RALLY_SERVER` - URL to connect to **Rally**
- `RALLY_USERNAME` - Username to authenticate to **Rally**
- `RALLY_PASSWORD` - Password to `RALLY_USERNAME` to authenticate to **Rally** (*Note:* `RALLY_API_KEY` is preferred method)
- `RALLY_API_KEY` - API key to authenticate to **Rally** instead of `RALLY_USERNAME` and `RALLY_PASSWORD`
- `ENFORCE_ALL_REPOS` - **true** or **false**, will set enforcement of `Probot-Rally` on all repositories in the installed Organization

One of the following is **required**:
- `PRIVATE_KEY` - The contents of the private key for your **GitHub App**. If you're unable to use multi-line environment variables, use base64 encoding to convert the key to a single line string.
- `PRIVATE_KEY_PATH` - The path to the .pem file for your **GitHub App**.
  (Example: `PRIVATE_KEY_PATH='path/to/key.pem'`)

## How users can consume Probot-Rally GitHub App
Once you have the **GitHub App** up and running, users will need to add the configuration file to **master** branch to have the **GitHub App** validate their repositories: `.github/probot-rally.yml`

- Having this file in the root of the repository is what signals the **Probot-Rally GitHub App** to view all configured events for the repository
- The configuration file allows users to make small customizations to how the bot interacts with their codebase
- Users will also want to configure `protected branches` to help make sure all rules are followed and enforced by the validator bot
