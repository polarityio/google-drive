'use strict';

const { google } = require('googleapis');
const async = require('async');
const config = require('./config/config');
const privateKey = require(config.auth.key);

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
  'application/vnd.google-apps.drive-sdk': 'sdk'
};

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
  jwtClient.authorize(function(err, tokens) {
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

        drive.files.list(
          {
            includeTeamDriveItems: true,
            supportsTeamDrives: true,
            q: `fullText contains '${entity.value}'`
          },
          function(err, response) {
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
              files.forEach((file) => {
                file.icon = mimeTypes[file.mimeType];
              });

              lookupResults.push({
                entity: entity,
                data: {
                  summary: _getSummaryTags(files),
                  details: files
                }
              });
            }

            done();
          }
        );
      },
      (err) => {
        cb(err, lookupResults);
      }
    );
  });
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
  jwtClient = new google.auth.JWT(privateKey.client_email, null, privateKey.private_key, [
    'https://www.googleapis.com/auth/drive'
  ]);
}

module.exports = {
  doLookup: doLookup,
  startup: startup
};
