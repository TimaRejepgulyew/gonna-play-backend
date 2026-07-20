# Use Node.js LTS as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Generate the Prisma client before compiling: model types come from it
RUN npx prisma generate

# Build the application
RUN npm run build

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"] 