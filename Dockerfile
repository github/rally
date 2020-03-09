#################################
## Dockerfile for Probot-Rally ##
#################################

## Base image
FROM node:10-alpine

## Set the Labels
LABEL version="1.0" \
      description="Probot app to verify Rally issues in a Pull Request" \
      maintainer="GitHub Professional Services <services@github.com>"

## These files are copied separately to allow updates
## to the image to be as small as possible
COPY --chown=node:node package.json /opt/probot-rally/
COPY --chown=node:node index.js /opt/probot-rally/
COPY --chown=node:node lib /opt/probot-rally/lib

## You should edit .env.example and save it before building this image
## Future updates to this Dockerfile _may_ move this over to
## pure environment variables in Docker, so it can be passed at the CLI.
## This will be purely based on demand
COPY --chown=node:node .env /opt/probot-rally/

## This can probably be removed, but users will have to make sure they
## run the container, then copy the key. This helps avoid that for folks
## using this in their enterprise environments
COPY --chown=node:node .ssh/probot-rally.pem /opt/probot-rally/.ssh/

## We need Python for Probot
RUN apk add --no-cache make python

## Best practice, don't run as `root`
USER node

## Set our working directory
WORKDIR /opt/probot-rally

## Not strictly necessary, but set permissions to 400
RUN chmod 400 /opt/probot-rally/.ssh/probot-rally.pem /opt/probot-rally/.env

## Install the app and dependencies
RUN npm install

## This app will listen on port 3000
EXPOSE 3000

## This does not start properly when using the ['npm','start'] format
## so stick with just calling it outright
CMD npm start
