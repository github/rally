# Pull Rally Probot and run image from DockerHub
The **Rally + GitHub** app can be pulled from **Docker Hub** and deployed using your container environment.
The only work needed would be loading the correct environment variables.

## Pull Image down from DockerHub
- Currently the image is hosted at `docker://github/rally`
- You can pull the image down with: `docker pull github/rally:latest` or a specific version

## Run Container with environment variables
- You can then run the downloaded container by passing all information as environment variables
  - `docker run -e APP_ID=<123> -e WEBHOOK_SECRET=<SECRET> github/rally`
- You could run using docker compose
```yml
---
#####################################
# Docker compose for Rally + GitHub #
#####################################

###########
# Version #
###########
version: '3.3'

####################
# Set the services #
####################
services:
    rally:
        # Set the open ports
        ports:
            - '3000:3000'
        # Set to restart on error
        restart: always
        # Set logging informatgion
        logging:
            options:
                max-size: 1g
        environment:
          - APP_ID=<123>
          - WEBHOOK_SECRET=<SECRET>
        # Start the image
        image: github/rally
```
