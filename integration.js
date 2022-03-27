'use strict';

const { google } = require('googleapis');
const async = require('async');
const config = require('./config/config');
const gaxios = require('gaxios');
const privateKey = require(config.auth.key);
const textract = require('textract');
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
                file._icon = mimeTypes[file.mimeType] ? mimeTypes[file.mimeType] : DEFAULT_FILE_ICON;
                file._typeForUrl = getTypeForUrl(file);
                if (file.hasThumbnail && options.shouldDisplayFileThumbnails) {
                  file._thumbnailBase64 = await downloadThumbnail(tokens.access_token, file.thumbnailLink);
                }
                if (options.shouldGetFileContent) {
                  file._content = await getFileContent(drive, file);
                }
              } catch (downloadErr) {
                file._thumbnailError = downloadErr;
              }
            });

            const searchTerm = entity.value.toLowerCase().trim();
            const searchId = uuidv4();
            const { files: updatedFiles, totalMatchCount } = addHighlightsHtml(files, searchTerm, searchId);
            lookupResults.push({
              entity,
              data: {
                summary: [], // Tags obtain from details.  Must include empty array for summary tag components to render.
                details: { files: updatedFiles, searchId, searchTerm, totalMatchCount }
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

function addHighlightsHtml(files, searchTerm, searchId) {
  // Highlight search term
  const searchTermRegex = new RegExp(`(?<!<[^>]*)${searchTerm}`, 'gi');
  let matchCount = 1;
  files.forEach((file, index) => {
    if(!file._content) return;
    const htmlRegex = /<[^>]*(>|$)|&nbsp;|&zwnj;|&raquo;|&laquo;|&gt;/g;
    file._content = file._content.replace(htmlRegex, '');

    // Remove strange characters
    const badCharRegex = /â|Â&nbsp;|â|Â|â¢|â¢&#160|â;|â¢&#160;|âs|[^\x00-\x7F]/g;
    file._content = file._content.replace(badCharRegex, '');
    
    const range = [];
    range[0] = matchCount;
    
    file._content = file._content.replace(
      searchTermRegex,
      (match, offset) => { 
        range[1] = matchCount++
        return `<span class='highlight' id='${searchId}-${range[1]}'>${match}</span>`;}
    );
    file.range = range;
    file.index = index
  });

  return {
    files,
    totalMatchCount: matchCount - 1
  };
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

const MIME_EXPORT_TYPES = {
  'application/vnd.google-apps.presentation': 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.document': 'application/vnd.oasis.opendocument.text',
  'application/pdf': 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.google-apps.script': 'application/vnd.google-apps.script+json'
};

async function getFileContent(drive, file) {
  const mimeType = MIME_EXPORT_TYPES[file.mimeType] || file.mimeType;
  if (mimeType.includes('image') || mimeType.includes('jam') || mimeType.includes('jam')) return;

  let requestResultBuffer;
  try {
    requestResultBuffer = await drive.files.export(
      {
        fileId: file.id,
        mimeType: mimeType
      },
      {
        responseType: 'arraybuffer'
      }
    );
  } catch (error) {}
  try {
    requestResultBuffer = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
  } catch (error) {}
  try {
    if (!requestResultBuffer) return;

    const extractedText = await new Promise((res, rej) =>
      textract.fromBufferWithMime(
        mimeType,
        new Buffer.from(requestResultBuffer.data, 'binary'),
        { preserveLineBreaks: true },
        function (error, text) {
          if (error) return rej(error);
          res(text);
        }
      )
    );
    return extractedText;
  } catch (error) {}
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

module.exports = {
  doLookup: doLookup,
  startup: startup,
  validateOptions: validateOptions
};
