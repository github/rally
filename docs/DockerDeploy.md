# Docker Deployment Guide
This document will help outline the steps needed to deploy the **Rally + GitHub** **GitHub App** as a **Docker** container in your environment. This method should allow for multiple automations and ease of use.

## How to Deploy

### Create GitHub App on GitHub
You can find all the steps to create the GitHub app from the [README](https://github.com/github/rally/blob/main/.github/README.md) on the root of the source code. You will need the **endpoints**, and `.pem` created to be able to deploy the **GitHub App**.

### Prepare the source code
You will first need to clone the source code to your local environment that will run the **Docker** container.
- Clone the codebase
  - `git clone https://github.com/github/rally.git`
- Change directory to inside the code base
  - `cd rally/`
- Create `.env` from `.env.example`
  - `cp .env.example .env`
- Update the `.env` with thew needed fields, such as:
  - `APP_ID` - The App ID of the **GitHub App**
  - `WEBHOOK_SECRET` - The secret to prevent man in the middle attacks
  - `GHE_HOST` - This is a required field for **GitHub Enterprise Server** implementations (_Example: github.mycompany.com_)
  - `RALLY_SERVER` - URL to connect to **Rally**
  - `RALLY_USERNAME` - Username to authenticate to **Rally**
  - `RALLY_PASSWORD` - Password to `RALLY_USERNAME` to authenticate to **Rally** (*Note:* `RALLY_API_KEY` is preferred method)
  - `RALLY_API_KEY` - API key to authenticate to **Rally** instead of `RALLY_USERNAME` and `RALLY_PASSWORD`
![rally-token](https://user-images.githubusercontent.com/2894107/89300774-56b89b00-d62e-11ea-94c9-066e12ac5246.png)
  - `ENFORCE_ALL_REPOS` - **true** or **false**, will set enforcement of `Rally + GitHub` on all repositories in the installed Organization
  - `ORG_CONFIG_REPO_NAME` - Repository name where an organization-level configuration can set default behavior for all repositories (Default: `rally-github-config`)

You will need to copy the contents of the `.pem` created from **GitHub** to the location: `/opt/rally/.ssh/rally.pem`. This will be used when the container is built and deployed.

Once you have the `.env` file configured, you are ready to start the building of the container.

### Build the Docker container
Once you have configured the **GitHub App** and updated the source code, you should be ready to build the container.
- Change directory to inside the code base
  - `cd rally/`
- Build the container
  - `sudo docker build -t rally .`
- This process should complete successfully and you will then have a **Docker** container ready for deployment

### Run the Docker container
Once the container has been successfully built, you can deploy it and start utilizing the **GitHub App**.

#### Start the container with docker-compose
If you have docker-compose installed, you can simply start and stop the **Docker** container with:
- `cd rally/; docker-compose up -d`
This will start the container in the background and detached.

#### Start Docker container Detached in background
- Start the container detached with port assigned (*Assuming port 3000 for the webhook*)
  - `sudo docker run -d -p 3000:3000 rally`
- You should now have the container running in the background and can validate it running with the command:
  - `sudo docker ps`
- This should show the `rally` alive and running

#### Start Docker container attached in forground (Debug)
- If you need to run the container in interactive mode to validate connectivity and functionality:
  - `sudo docker run -it -p 3000:3000 rally`
- You will now have the log of the container showing to your terminal, and can validate connectivity and functionality.

#### Connect to running Docker container (Debug)
- If you need to connect to the container thats already running, you can run the following command:
  - `sudo docker exec -it rally /bin/sh`
- You will now be inside the running **Docker** container and can perform any troubleshooting needed
