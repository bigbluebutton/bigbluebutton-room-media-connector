#!/bin/bash

# This script installs the build dependencies for the HTML plugin debian package.
# Do not use the github action node-setup, because it will not work with the debian package build.

set -eux

apt-get update
apt-get install -y build-essential devscripts debhelper lintian ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs
