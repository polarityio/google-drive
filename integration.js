'use strict';

const { google } = require('googleapis');
const async = require('async');
const config = require('./config/config');
const gaxios = require('gaxios');
const privateKey = require(config.auth.key);
const DRIVE_AUTH_URL = 'https://www.googleapis.com/auth/drive';
const MAX_PARALLEL_THUMBNAIL_DOWNLOADS = 10;
const { v4: uuidv4 } = require('uuid');
const getFileContentOnMessage = require('./src/getFileContentOnMessage');

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
let jwtClient;
let auth;
/**
 *
 * @param entities
 * @param options
 * @param cb
 */
function doLookup(entities, options, cb) {
  Logger.debug({ entities: entities }, 'doLookup');
  let lookupResults = [];

  //authenticate request
  jwtClient.authorize(function (err, tokens) {
    if (err) {
      Logger.error({ err: err }, 'Failed to authorize client');
      return cb({
        detail: 'Failed to authenticate with Google Drive',
        err: err
      });
    }

    async.forEach(
      entities,
      (entity, done) => {
        let drive = google.drive({ version: 'v3', auth });

        drive.files.list(getSearchOptions(entity, options), async (err, response) => {
          if (err) {
            Logger.error({ err: err }, 'Error listing files');
            return done({
              detail: 'Failed to list files',
              err: err
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
                    ? await downloadThumbnail(tokens.access_token, file.thumbnailLink)
                    : undefined;
                file._content = options.shouldGetFileContent ? 'useOnMessageFileContentLookup' : undefined;
              } catch (downloadErr) {
                file._thumbnailError = downloadErr;
              }
            });

            const searchId = uuidv4();

            lookupResults.push({
              entity,
              data: {
                summary: [], // Tags obtain from details.  Must include empty array for summary tag components to render.
                details: { files, searchId, totalMatchCount: 0 }
              }
            });
          }

          done();
        });
      },
      (err) => {
        cb(err, lookupResults);
      }
    );
  });
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

  jwtClient = new google.auth.JWT(privateKey.client_email, null, privateKey.private_key, [DRIVE_AUTH_URL]);
  auth = new google.auth.GoogleAuth({
    keyFile: config.auth.key,
    scopes: [DRIVE_AUTH_URL]
  });
}

function validateOptions(userOptions, cb) {
  let errors = [];

  let searchScope = userOptions.searchScope.value.value;
  let driveId = userOptions.driveId.value;

  if (searchScope === 'drive' && typeof driveId === 'string' && driveId.length === 0) {
    errors.push({
      key: 'driveId',
      message: 'You must provide a `Drive ID to Search` if you set a `Search Scope` of [drive]'
    });
  }

  cb(null, errors);
}

const getOnMessage = {
  getFileContent: getFileContentOnMessage
};

const onMessage = ({ action, data: actionParams }, options, callback) =>
  getOnMessage[action](actionParams, options, auth, callback, Logger);

module.exports = {
  startup,
  validateOptions,
  doLookup,
  onMessage
};
