/*
 * Copyright (c) 2023, Polarity.io, Inc.
 */
const express = require('express');
const helmet = require('helmet');
const https = require('https');
const process = require('process');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const { getLogger } = require('./logger');
const NodeCache = require('node-cache');
const authServerConfig = require('../config/auth-server-config.json');
const DRIVE_AUTH_URL = 'https://www.googleapis.com/auth/drive.readonly';

const STATE_TOKEN_EXPIRATION = 120; // 120 seconds
let oauthClientCache;
let stateTokenCache;
let expiredTokenCache;

/**
 * General purpose auth server for Polarity Integrations.  This server is used to handle OAuth2 authentication
 *
 * OAuth Flow:
 *
 * 1. User initiates search
 * 2. Integration attempts to get the user's OAuth client
 * 3. If the OAuth client is available,
 *
 * GitHub Thread on Refresh Tokens: https://github.com/googleapis/google-api-nodejs-client/issues/750
 *
 * Information on setting up Oauth authentication: https://developers.google.com/people/quickstart/nodejs
 */
class AuthServer {
  constructor() {
    oauthClientCache = new NodeCache();
    stateTokenCache = new NodeCache({
      // This is how often the cache checks for expired keys and fires the `expired` event
      checkperiod: STATE_TOKEN_EXPIRATION / 4
    });
    expiredTokenCache = new NodeCache();

    this.Logger = getLogger();

    stateTokenCache.on('expired', (key, value) => {
      expiredTokenCache.set(key, value);
    });

    this.server = null;

    this.startAuthServer();
  }

  hasAuthClient(userId) {
    return oauthClientCache.has(userId);
  }

  isAuthClientAuthenticated(userId) {
    if (this.hasAuthClient(userId)) {
      const authClient = this.getAuthClient(userId);
      if (authClient.credentials && authClient.credentials.access_token) {
        // expiry_date is in Unix Epoch Time Milliseconds
        if (Date.now() < authClient.credentials.expiry_date) {
          return true;
        }
      }
    }
    return false;
  }

  isStateTokenExpired(stateToken) {
    return expiredTokenCache.has(stateToken);
  }

  getAuthClient(userId) {
    return oauthClientCache.get(userId).client;
  }

  deleteAuthClient(userId) {
    oauthClientCache.del(userId);
  }

  createAuthClient(options) {
    // https://console.cloud.google.com/apis/credentials
    const oauth2Client = new google.auth.OAuth2(
      options.oauthClientId,
      options.oauthClientSecret,
      `${options.oauthRedirectHost}/_int/google-drive/auth`
    );

    const stateToken = this.generateOauthStateToken(options);

    const authUrl = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',
      prompt: 'consent',

      // If you only need one scope you can pass it as a string
      scope: [DRIVE_AUTH_URL],
      state: stateToken
    });

    // Save the state token with an expiration set by STATE_TOKEN_EXPIRATION
    // During this window we expect an auth request callback to be made with the state token
    stateTokenCache.set(
      stateToken,
      {
        client: oauth2Client,
        userId: options._request.user.id,
        username: options._request.user.username
      },
      STATE_TOKEN_EXPIRATION
    );

    return {
      authUrl,
      stateToken
    };
  }

  generateOauthStateToken(options) {
    let stateToken = crypto.randomBytes(64).toString('hex');
    return stateToken;
  }

  hashUser(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex');
  }

  async stopAuthServer() {
    return new Promise((resolve, reject) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  startAuthServer() {
    const Logger = getLogger();
    const app = express();

    app.use(helmet());
    app.disable('x-powered-by');

    app.use('/images', express.static(path.join(process.cwd(), '/www/images')));

    app.get('/auth', async (req, res) => {
      Logger.trace({ req, queryParams: req.query }, 'Received auth request');
      let authCode = req.query.code;
      let stateToken = req.query.state;

      if (stateTokenCache.has(stateToken)) {
        const { client, username, userId } = stateTokenCache.take(stateToken);

        // `tokens` is an object containing our `access_token` and `refresh_token`
        //
        // tokens: {
        //   "access_token": "<access_token>",
        //   "refresh_token": "<refresh_token>",
        //   "scope": "https://www.googleapis.com/auth/drive.readonly",
        //   "token_type": "Bearer",
        //   "expiry_date": 1696777464451
        // }
        const { tokens } = await client.getToken(authCode);
        client.setCredentials(tokens);

        // this is a legitimate auth request as we have a valid state token for it.  We store the
        // user's oauth client in our oauthClientCache
        oauthClientCache.set(userId, {
          client,
          username,
          userId
        });

        Logger.trace({ username }, `Successfully authenticated and cached user's oauth client`);
        res.sendFile(path.join(process.cwd(), '/www/success.html'));
      } else if (expiredTokenCache.has(stateToken)) {
        Logger.trace({ stateToken }, `State token provided in auth request is expired`);
        // this state token was valid at some point but is now expired
        // This can occur if the user waits too long to click the auth link or could
        // be a replay attack
        res.sendFile(path.join(process.cwd(), '/www/expired.html'));
      } else {
        Logger.trace({ stateToken }, `State token is invalid`);
        // this is either a forgery or the state token has expired
        res.sendFile(path.join(process.cwd(), '/www/failure.html'));
      }
    });

    app.use((req, res, next) => {
      res.status(404).send('404 - Not Found');
    });

    if (authServerConfig.sslEnabled) {
      this.server = https.createServer(
        {
          key: fs.readFileSync(authServerConfig.sslPrivateKey),
          cert: fs.readFileSync(authServerConfig.sslCert)
        },
        app
      );
    } else {
      this.server = http.createServer(app);
    }

    this.server.listen(authServerConfig.port, () => {
      Logger.info(
        `Polarity-Google Drive Auth Server Listening on port ${authServerConfig.port} over ${
          authServerConfig.sslEnabled ? 'HTTPS' : 'HTTP'
        }`
      );
    });
  }
}

module.exports = AuthServer;
