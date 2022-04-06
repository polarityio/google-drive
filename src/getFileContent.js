'use strict';

const textract = require('textract');

const MIME_EXPORT_TYPES = {
  'application/vnd.google-apps.presentation': 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.document': 'application/vnd.oasis.opendocument.text',
  'application/pdf': 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.google-apps.script': 'application/vnd.google-apps.script+json'
};

const getFileContent = async (drive, file) => {
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
};

module.exports = getFileContent;
