'use strict';

const { google } = require('googleapis');
const async = require('async');
const config = require('./config/config');
const gaxios = require('gaxios');
const privateKey = require(config.auth.key);
const DRIVE_AUTH_URL = 'https://www.googleapis.com/auth/drive';

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

let jwtClient;
let Logger;

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
        let drive = google.drive({ version: 'v3', auth: jwtClient });
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
            lookupResults.push({
              entity: entity,
              data: null
            });
          } else {
            for await (let file of files) {
              file._icon = mimeTypes[file.mimeType] ? mimeTypes[file.mimeType] : DEFAULT_FILE_ICON;
              file._typeForUrl = getTypeForUrl(file);
              try {
                file._thumbnailBase64 = await downloadThumbnail(tokens.access_token, file.thumbnailLink);
              } catch (thumbnailError) {
                Logger.error(thumbnailError, 'Error getting thumbnail');
              }
            }

            lookupResults.push({
              entity: entity,
              data: {
                summary: _getSummaryTags(files),
                details: files
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
    encoding: null,
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
          'files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    case 'drive':
      return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'drive',
        driveId: options.driveId,
        q: `fullText contains '${entity.value}'`,
        fields:
          'files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    case 'allDrives': {
      return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        q: `fullText contains '${entity.value}'`,
        fields:
          'files(mimeType),files(id),files(name),files(hasThumbnail),files(thumbnailLink),files(lastModifyingUser(displayName)),files(lastModifyingUser(photoLink)),files(iconLink)'
      };
    }
  }
}

function _getSummaryTags(files) {
  let tags = files.slice(0, 5).map((file) => {
    return file.name;
  });

  if (tags.length !== files.length) {
    tags.push(`+${files.length - tags.length} more files`);
  }

  return tags;
}

function startup(logger) {
  Logger = logger;

  // configure a JWT auth client
  jwtClient = new google.auth.JWT(privateKey.client_email, null, privateKey.private_key, [DRIVE_AUTH_URL]);
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

module.exports = {
  doLookup: doLookup,
  startup: startup,
  validateOptions: validateOptions
};
