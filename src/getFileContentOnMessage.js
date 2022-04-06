const { google } = require('googleapis');

const getFileContent = require('./getFileContent');
const addHighlightsHtml = require('./addHighlightsHtml');

const parseErrorToReadableJSON = (error) => JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));

const getFileContentOnMessage = async (
  { file, entity, searchId, totalMatchCount },
  options,
  auth,
  callback,
  Logger
) => {
  try {
    let drive = google.drive({ version: 'v3', auth });

    file._content = (await getFileContent(drive, file)) || 'No Content Found';

    const searchTerm = entity.value.toLowerCase().trim();

    const {
      files: [newFileWithContent],
      totalMatchCount: contentMatchCount
    } = addHighlightsHtml([file], searchTerm, searchId, totalMatchCount + 1);

    callback(null, {
      newFileWithContent,
      contentMatchCount
    });
  } catch (error) {
    const err = parseErrorToReadableJSON(error);
    Logger.error(
      {
        detail: 'Failed to Getting File Content',
        options,
        formattedError: err
      },
      'Getting File Content Failed'
    );
    const { title, detail, code } = {
      title: error.message,
      detail: 'Getting File Content Unsuccessful',
      code: error.status
    };
    return callback({
      errors: [
        {
          err: error,
          detail: `${title}${detail ? ` - ${detail}` : ''}${code ? `, Code: ${code}` : ''}`
        }
      ]
    });
  }
};

module.exports = getFileContentOnMessage;
