#!/bin/bash
# Start Xvfb in the background
/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
# Wait a few seconds for Xvfb to initialize
sleep 2
# Change to the project directory
cd ~/discord-youtube-bot
# Start the Node.js bot
node index.js
