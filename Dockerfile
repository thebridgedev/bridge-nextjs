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


RUN npm install -g pnpm npm-check-updates

# Install Chrome dependencies and Chrome itself
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=$(dpkg --print-architecture)] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome binary location
ENV CHROME_BIN=/usr/bin/chromium


# Puppetter is not needed right now but will be needed very soon
# RUN npm i puppeteer \
#     # Add user so we don't need --no-sandbox.
#     # same layer as npm install to keep re-chowned files from using up several hundred MBs more space
#     && groupadd -r appuser && useradd -r -s /bin/zsh -g appuser -G audio,video appuser \
#     && mkdir -p /home/appuser/Downloads \
#     && chown -R appuser:appuser /home/appuser
#     # && chown -R pptruser:pptruser node_modules/ \
#     # && chown -R pptruser:pptruser package.json \
#     # && chown -R pptruser:pptruser package-lock.json \
#     # && chown -R pptruser:pptruser /app


# Change to non-root user
USER $USER

# Copy package files with correct ownership
#COPY --chown=$USER:$USER ["package.json", "package-lock.json", "./"]

# Referring to base, and adding new build stage label 'dev'
FROM base as dev
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy the rest of the application files
COPY --chown=$USER:$USER . .

# The working directory is already set to /home/appuser/app in the base stage
