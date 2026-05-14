# SiSMoChat Web Client POC

Minimal web interface for testing the [SiSMoChat API](https://github.com/ml-net/sismochat_api).

## Running

1. Start the API server (see [sismochat_api](https://github.com/ml-net/sismochat_api))

2. Open `index.html` in a browser (or serve it):
   ```bash
   npx serve .
   ```

3. The client connects to `http://localhost:3000` by default. To change, set `apiBase` in localStorage:
   ```js
   localStorage.setItem('apiBase', 'http://192.168.1.100:3000')
   ```

## Features

- Parent: register, login, create child users, manage connections
- User: login with device token, send messages, download + ACK (relay pattern)
- Messages saved in localStorage (client is source of truth)

## Note

This is a **proof of concept** - no encryption is applied on the client side yet. Messages are sent in plain text for testing purposes.
