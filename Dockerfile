# Use an official Node.js 16 runtime as the base image
FROM node:16 AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install project dependencies for building
RUN npm install

# Copy the entire source code into the container
COPY . .

# Expose a port (replace 8000 with your application's port if needed)
EXPOSE 8000

# Define the command to run your application
CMD ["npm", "run", "dev"]