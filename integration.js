'use strict';

const { google } = require('googleapis');
const async = require('async');
const config = require('./config/config');
const privateKey = require(config.auth.key);

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
            //auth: jwtClient,
            includeTeamDriveItems: true,
            supportsTeamDrives: true,
            spaces: 'drive',
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
              lookupResults.push({
                entity: entity,
                data: {
                  summary: [],
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
