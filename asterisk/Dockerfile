FROM node:22-bookworm-slim

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/ ./

RUN cp ./core.js /bin/core.js \
 && cp ./bin/mini-run.js /bin/mini-run.js \
 && chmod +x /bin/mini-run.js \
 && chgrp node /bin \
 && chmod g+rwx /bin

ENV FLAG_PATH=/flag
RUN echo "CyKor{dummy_flag_for_test}" > /flag \
 && chown node:node /flag \
 && chmod 400 /flag

ENV BIN_DIR=/bin \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000

USER node

CMD ["node", "index.js"]
