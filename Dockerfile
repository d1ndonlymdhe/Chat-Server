FROM node:16-alpine
WORKDIR /src
COPY package*.json .
RUN npm install
COPY out .
EXPOSE 4000
CMD ["node","index.js"]