'use strict';

const { google } = require('googleapis');
const async = require('async');
const crypto = require('crypto');
const config = require('./config/config');
const gaxios = require('gaxios');
const { setLogger } = require('./lib/logger');
const authServerConfig = require('./config/auth-server-config.json');
const AuthServer = require('./lib/auth-server');
const DRIVE_AUTH_URL = 'https://www.googleapis.com/auth/drive';
const MAX_PARALLEL_THUMBNAIL_DOWNLOADS = 10;
const { v4: uuidv4 } = require('uuid');

const mimeTypes = {
  'application/vnd.google-apps.audio': 'file-audio',
  'application/vnd.google-apps.document': 'file-alt',
  'application/vnd.google-apps.drawing': 'drawing',
  'application/vnd.google-apps.file': 'file',
  'application/vnd.google-apps.folder': 'folder',
  'application/vnd.google-apps.form': 'form',
  'application/vnd.google-apps.fusiontable': 'table',
  'application/vnd.google-apps.map': 'map',
  'application/vnd.google-apps.photo': 'image',
  'application/vnd.google-apps.presentation': 'presentation',
  'application/vnd.google-apps.script': 'scroll',
  'application/vnd.google-apps.site': 'globe',
  'application/vnd.google-apps.spreadsheet': 'file-spreadsheet',
  'application/vnd.google-apps.unknown': 'file',
  'application/vnd.google-apps.video': 'file-video',
  'application/vnd.google-apps.drive-sdk': 'sdk',
  'application/pdf': 'file-pdf',
  'text/plain': 'file'
};

const DEFAULT_FILE_ICON = 'file';

let Logger;
let auth;
let oauthServer;

function createAuthRequiredResult(entities, options) {
  let { authUrl, stateToken } = oauthServer.createAuthClient(options)
  return [
    {
      entity: {
        ...entities[0],
        value: 'Google Drive Auth Required'
      },
      data: {
        summary: ['Auth Required'],
        details: {
          authUrl,
          stateToken,
          entities
        }
      }
    }
  ];
}

function getUserId(options) {
  return options._request.user.id;
}

/**
 *
 * @param entities
 * @param options
 * @param cb
 */
async function doLookup(entities, options, cb) {
  Logger.debug({ entities: entities }, 'doLookup');
  let lookupResults = [];

  const userId = options._request.user.id;

  // If oauth enabled
  if (authServerConfig.enabled) {
    if (oauthServer.hasAuthClient(userId)) {
      // we already have an auth client for this user
      Logger.debug({ userId: userId }, 'Using cached auth client for user');
      auth = oauthServer.getAuthClient(userId);
    } else {
      // we need to return an auth request result which prompts the user
      // to authenticate via oauth
      return cb(null, createAuthRequiredResult(entities, options));
    }
  }

  async.forEach(
    entities,
    (entity, done) => {
      let drive = google.drive({
        version: 'v3',
        auth
      });

      drive.files.list(getSearchOptions(entity, options), async (err, response) => {
        if (err) {
          return done({
            detail: 'Failed to list files',
            err: err,
            code: err.code
          });
        }

        Logger.trace(response);

        let files = response.data.files;
        if (files.length === 0) {
          Logger.trace('No files found.');
          lookupResults.push({ entity, data: null });
        } else {
          // For each file, if it has a thumbnail, download the thumbnail
          await async.eachOfLimit(files, MAX_PARALLEL_THUMBNAIL_DOWNLOADS, async (file) => {
            try {
              file._icon = mimeTypes[file.mimeType] || DEFAULT_FILE_ICON;
              file._typeForUrl = getTypeForUrl(file);

              file._thumbnailBase64 =
                file.hasThumbnail && options.shouldDisplayFileThumbnails
                  ? await downloadThumbnail(auth.access_token, file.thumbnailLink)
                  : undefined;
            } catch (downloadErr) {
              file._thumbnailError = downloadErr;
            }
          });

          const searchId = uuidv4();

          lookupResults.push({
            entity,
            data: {
              summary: [],
              details: { files, searchId, totalMatchCount: 0 }
            }
          });
        }

        done();
      });
    },
    (err) => {
      if (err && err.code === 401 && authServerConfig.enabled) {
        // Note that this error is expected if the integration is using OAuth authentication and
        // the user's auth client has expired.  In this case we want to return an auth required result
        Logger.debug({ err: err }, 'Auth Error, returning auth required result');
        cb(null, createAuthRequiredResult(entities, options));
      } else if (err) {
        Logger.error({ err: err }, 'Error listing files');
        cb(err, []);
      } else {
        cb(null, lookupResults);
      }
    }
  );
}

async function downloadThumbnail(authToken, thumbnailUrl) {
  const requestOptions = {
    url: thumbnailUrl,
    headers: {
      Authorization: `Bearer ${authToken}`
    },
    responseType: 'arraybuffer'
  };
  const response = await gaxios.request(requestOptions);
  return `data:image/png;charset=utf-8;base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
}

function getTypeForUrl(file) {
  if (file.mimeType === 'application/vnd.google-apps.presentation') {
    return 'presentation';
  }
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    return 'spreadsheets';
  }

  return 'document';
}

function getSearchOptions(entity, options) {
  switch (options.searchScope.value) {
    case 'default':
      return {
        includeTeamDriveItems: true,
        supportsTeamDrives: true,
        q: `fullText contains '${entity.value}'`,
        fields:
          'files(modifiedTime),files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    case 'drive':
      return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'drive',
        driveId: options.driveId,
        q: `fullText contains '${entity.value}'`,
        fields:
          'files(modifiedTime),files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    case 'allDrives': {
      return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        q: `fullText contains '${entity.value}'`,
        fields:
          'files(modifiedTime),files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    }
  }
}

function startup(logger) {
  Logger = logger;
  setLogger(Logger);

  if (authServerConfig.enabled) {
    oauthServer = new AuthServer();
  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: config.auth.key,
      scopes: [DRIVE_AUTH_URL]
    });
  }
}

function validateOptions(userOptions, cb) {
  let errors = [];

  let searchScope = userOptions.searchScope.value.value;
  let driveId = userOptions.driveId.value;

  if(authServerConfig.enabled) {

  }

  if (searchScope === 'drive' && typeof driveId === 'string' && driveId.length === 0) {
    errors.push({
      key: 'driveId',
      message: 'You must provide a `Drive ID to Search` if you set a `Search Scope` of [drive]'
    });
  }

  cb(null, errors);
}

function onMessage(payload, options, cb) {
  Logger.trace({ payload }, 'onMessage request received');
  switch (payload.action) {
    case 'VERIFY_AUTH':
      const requestingUserId = getUserId(options);
      const isExpired = oauthServer.isStateTokenExpired(payload.stateToken);
      const isAuthenticated = oauthServer.isAuthClientAuthenticated(requestingUserId);
      Logger.trace({ isAuthenticated, isExpired, requestingUserId }, 'VERIFY_AUTH response');
      cb(null, {
        isAuthenticated,
        isExpired
      });
      break;
    default:
      Logger.error({payload}, 'Invalid Action');
      cb({
        detail: 'Invalid Action'
      });
  }
}

module.exports = {
  startup,
  validateOptions,
  doLookup,
  onMessage
};
