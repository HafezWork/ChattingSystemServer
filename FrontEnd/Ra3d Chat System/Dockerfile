# Use official Node LTS image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first (for faster builds)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Set default user (can be overridden)
ENV USER_NAME=user1

# Expose port if your app uses any server (adjust if needed)
EXPOSE 3000

# Run Electron with dynamic user
CMD ["sh", "-c", "npm run start:user"]
