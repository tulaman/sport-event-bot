FROM node:20
WORKDIR /app

# Install dotenvx
RUN curl -sfS https://dotenvx.sh/install.sh | sh

COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080

CMD ["dotenvx", "run", "--", "node", "app.js"]