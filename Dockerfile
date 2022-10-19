###################################
## Dockerfile for Rally + GitHub ##
###################################

## Base image
FROM node:19-alpine

## Set the Labels
LABEL version="1.0" \
      description="Probot app to verify Rally issues in a Pull Request" \
      maintainer="GitHub <opensource+rally@github.com>"

## These files are copied separately to allow updates
## to the image to be as small as possible
COPY --chown=node:node package.json /opt/rally/
COPY --chown=node:node index.js /opt/rally/
COPY --chown=node:node lib /opt/rally/lib

## You should edit .env.example and save it before building this image
## Future updates to this Dockerfile _may_ move this over to
## pure environment variables in Docker, so it can be passed at the CLI.
## This will be purely based on demand
# COPY --chown=node:node .env /opt/rally/

## This can probably be removed, but users will have to make sure they
## run the container, then copy the key. This helps avoid that for folks
## using this in their enterprise environments
# COPY --chown=node:node .ssh/rally.pem /opt/rally/.ssh/

## We need Python for Probot
RUN apk add --no-cache make python

## Best practice, don't run as `root`
USER node

## Set our working directory
WORKDIR /opt/rally

## Not strictly necessary, but set permissions to 400
# RUN chmod 400 /opt/rally/.ssh/rally.pem /opt/rally/.env

## Install the app and dependencies
RUN npm install

## This app will listen on port 3000
EXPOSE 3000

## This does not start properly when using the ['npm','start'] format
## so stick with just calling it outright
CMD npm start
