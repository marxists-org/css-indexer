FROM node:12
WORKDIR /usr/src/app
COPY . .
RUN npm install
RUN npm run-script build
RUN npm install -g
ENTRYPOINT ["css-indexer"]
