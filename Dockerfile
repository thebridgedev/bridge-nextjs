# syntax=docker/dockerfile:1

# Supports ARM + x86-64
FROM node:18 as base

# Install zshell and locales
RUN apt-get update && apt-get install -y zsh locales

SHELL ["/bin/zsh", "-c"]

# Set correct locale
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LC_ALL en_US.UTF-8

ENV USER=appuser
ENV HOME=/home/$USER


# Create a non-root user and set up their home directory
RUN useradd -m -s /bin/zsh $USER

# Set the working directory
WORKDIR /home/$USER

# Ensure the app directory is owned by appuser
RUN chown $USER:$USER /home/$USER/


RUN npm install -g npm-check-updates turbo

# Change to non-root user
USER $USER

# Referring to base, and adding new build stage label 'dev'
FROM base as dev

# Copy the rest of the application files
COPY --chown=$USER:$USER . .

# The working directory is already set to /home/appuser/app in the base stage
