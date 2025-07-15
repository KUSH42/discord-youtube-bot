#!/bin/bash
# Start Xvfb in the background
/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
# Wait a few seconds for Xvfb to initialize
sleep 2
# Change to the project directory (assuming script is in project root)
cd "$(dirname "$0")"
# Start the Node.js bot using system node or nvm if available
if command -v node &> /dev/null; then
    node index.js
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    node index.js
else
    echo "Node.js not found. Please install Node.js or NVM."
    exit 1
fi
