#!/usr/bin/env bash

################################################################################
############# Build / Compile / test Rally+GitHub @admiralawkbar ###############
################################################################################

#
# PRE-Requirements:
# - Dockerfile
# - System with Docker installed
# - Global variables met

###########
# Globals #
###########
GITHUB_SHA="${GITHUB_SHA}"                        # GitHub sha from the commit
GITHUB_EVENT_PATH="${GITHUB_EVENT_PATH}"          # Github Event Path
GITHUB_WORKSPACE="${GITHUB_WORKSPACE}"            # Github Workspace
CONFIG_FILE='.env'                                # Name of the config file
COMPOSE_FILE='docker-compose.yml'                 # Docker compose file
APP_ID='54'                                       # GHES Organization App ID for Probot
WEBHOOK_SECRET='development'                      # Webhook secret from GitHub App
IMAGE_NAME='github/rally'                         # Name of the container to build
TAG='latest'                                      # Tag for the container
GHE_HOST="${GHE_HOST}"                            # GHES Server URL
PRIVATE_KEY_DATA="${RALLY_TEST_PEM}"              # PEM key data to connect
PRIVATE_KEY_PATH='/opt/rally/.ssh/rally.pem'      # Path to drop the pem file
RALLY_API_KEY="${RALLY_TEST_API_KEY}"             # Rally API key to auth

################################################################################
############################ FUNCTIONS BELOW ###################################
################################################################################
################################################################################
#### Function Header ###########################################################
Header()
{
  echo ""
  echo "-----------------------------------------------------------"
  echo "----- GitHub Actions Build Compile Test Rally+GitHub ------"
  echo "-----------------------------------------------------------"
  echo "GITHUB_SHA:[$GITHUB_SHA]"
  echo "GITHUB_EVENT_PATH:[$GITHUB_EVENT_PATH]"
  echo "GITHUB_WORKSPACE:[$GITHUB_WORKSPACE]"
  echo "-----------------------------------------------------------"
  echo ""
}
################################################################################
#### Function CreateTestEnv ####################################################
CreateTestEnv()
{
  ####################################################
  # Create a test env file for the build and compile #
  ####################################################

  #########################
  # Make copy of template #
  #########################
  MakeCopy

  #######################
  # Create the pem file #
  #######################
  CreatePEM

  ########################
  # Update the variables #
  ########################
  UpdateVariables "APP_ID" "$APP_ID"
  UpdateVariables "WEBHOOK_SECRET" "$WEBHOOK_SECRET"
  UpdateVariables "# GHE_HOST" "$GHE_HOST"
  UpdateVariables "PRIVATE_KEY_PATH" "$PRIVATE_KEY_PATH"
  UpdateVariables "RALLY_API_KEY" "$RALLY_API_KEY"
}
################################################################################
#### Function CreatePEM ########################################################
CreatePEM()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Creating .pem for testing..."

  ###################################################
  # Copy to SSH folder for dockerfile build as well #
  ###################################################
  COPY_CMD=$(mkdir .ssh ; "$PRIVATE_KEY_DATA" > "$GITHUB_WORKSPACE/.ssh/rally.pem" 2>&1)

  ############################
  # Validate the file exists #
  ############################
  if [ ! -s "$GITHUB_WORKSPACE/.ssh/rally.pem" ]; then
    # The file is empty or does not exist
    echo "ERROR! Failed to create pem key file at:[$GITHUB_WORKSPACE/.ssh/rally.pem]"
    echo "ERROR:[$CREATE_CMD]"
    exit 1
  else
    # Success
    echo "Successfully created rally.pem at:[$GITHUB_WORKSPACE/.ssh/rally.pem]"
  fi
}
################################################################################
#### Function BuildImage #######################################################
BuildImage()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Building the Docker image..."

  #######################################
  # Build the image from the dockerfile #
  #######################################
  docker build --no-cache -t "$IMAGE_NAME:$TAG" -f Dockerfile . 2>&1
}
################################################################################
#### Function Footer ###########################################################
Footer()
{
  echo ""
  echo "-------------------------------------------------------"
  echo "The step has completed"
  echo "-------------------------------------------------------"
  echo ""
}
################################################################################
#### Function UpdateVariables ##################################################
UpdateVariables()
{
  ################
  # Pull in Vars #
  ################
  KEYWORD="$1"        # Key word to find in .env file
  VALUE="$2"          # Value for the keyword in .env file
  UPDATED_KEYWORD=''  # Will have the updated value of keyword

  ########################################
  # Check if a hidden value, then update #
  ########################################
  if [[ "$KEYWORD" =~ "#" ]]; then
    # Need to cut of first 2 chars
    UPDATED_KEYWORD=$(echo "$KEYWORD" |cut -c 2- 2>&1)
  else
    # No need to trim
    UPDATED_KEYWORD="$KEYWORD"
  fi

  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Updating .env variable:[$KEYWORD]..."

  #######################################
  # Updating the variables in .env file #
  #######################################
  UPDATE_CMD=$(sed -i "s|$KEYWORD=.*|$UPDATED_KEYWORD=$VALUE|g" "$CONFIG_FILE" 2>&1)

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # Error
    echo "ERROR! Failed to update config file with key:[$KEYWORD]!"
    echo "ERROR:[$UPDATE_CMD]"
    exit 1
  else
    # Success
    echo "Successfully updated config file with key:[$KEYWORD]"
  fi
}
################################################################################
#### Function MakeCopy #########################################################
MakeCopy()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Making copy of .env file..."

  #########################
  # Make copy of the file #
  #########################
  COPY_CMD=$(cp .env.example "$CONFIG_FILE" 2>&1)

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # Error
    echo "ERROR! Failed to make [.env] file for updates!"
    echo "ERROR:[$COPY_CMD]"
    exit 1
  else
    # Success
    echo "Sucessfully created .env at:[$GITHUB_WORKSPACE/$CONFIG_FILE]"
  fi
}
################################################################################
#### Function UpdateDockerCompose ##############################################
UpdateDockerCompose()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Updating docker-compose.yml for testing..."

  #######################################
  # Updating the variables in .env file #
  #######################################
  UPDATE_CMD=$(sed -i "s/restart:\ always/restart:\ 'no'/g" "$COMPOSE_FILE" 2>&1)

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # Error
    echo "ERROR! Failed to update docker compose for tests!"
    echo "ERROR:[$UPDATE_CMD]"
    exit 1
  else
    # Success
    echo "successfully updated docker-compose.yml for testing"
  fi

  echo "Cat of files!"
  cat .env
  echo "--------------"
  cat docker-compose.yml
  echo "--------------"
  ls -la /home/runner/work/rally/rally/rally.pem
  echo "--------------"
  cat /home/runner/work/rally/rally/rally.pem
}
################################################################################
#### Function StartContainer ###################################################
StartContainer()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Starting the container..."

  #####################################
  # Start the newly created container #
  #####################################
  docker-compose up -d 2>&1

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # ERROR
    echo "ERROR! Failed to start the container!"
    exit 1
  fi

  ####################################
  # Sleep for 10 sec to allow to run #
  ####################################
  echo "Sleeping for a few seconds to allow container to run..."
  sleep 10s

  ###################################################
  # Check to see if the container is up and running #
  ###################################################
  CHECK_CMD=$(docker ps | grep "$IMAGE_NAME" 2>&1)

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # ERROR
    echo "ERROR! Failed to find a running container!"
    echo "ERROR:[$CHECK_CMD]"
    exit 1
  else
    # Success
    echo "Container is up and running..."
    echo "$CHECK_CMD"
  fi
}
################################################################################
#### Function StopContainer ####################################################
StopContainer()
{
  #################
  # Print headers #
  #################
  echo "-------------------------------------------------------"
  echo "Stopping the container..."

  #############################
  # Stop the Docker container #
  #############################
  docker-compose down 2>&1

  #######################
  # Load the error code #
  #######################
  ERROR_CODE=$?

  ##############################
  # Check the shell for errors #
  ##############################
  if [ $ERROR_CODE -ne 0 ]; then
    # ERROR
    echo "ERROR! Failed to stop the container!"
    exit 1
  else
    # Success
    echo "Successfully stopped the container"
  fi
}
################################################################################
################################## MAIN ########################################
################################################################################

##########
# Header #
##########
Header

########################
# Create test env file #
########################
CreateTestEnv

###################
# Build the image #
###################
BuildImage

#########################
# Update Docker compose #
#########################
UpdateDockerCompose

#######################
# Start the container #
#######################
StartContainer

######################
# Stop the container #
######################
StopContainer

##########
# Footer #
##########
Footer
