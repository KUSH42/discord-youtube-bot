#!/bin/bash
# Start Xvfb in the background
/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
# Wait a few seconds for Xvfb to initialize
sleep 2
# Change to the project directory
cd /home/xush/discord-youtube-bot
# Start the Node.js bot
/home/xush/.nvm/versions/node/v22.17.0/bin/node index.js
