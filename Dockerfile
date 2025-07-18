# Use the official Node.js 20 image as a base
FROM mcr.microsoft.com/playwright:v1.28.1-focal

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Expose the port for the application
EXPOSE 3000

# Run the tests
CMD ["npm", "test"]
