function addHighlightsHtml(files, searchTerm, searchId, matchCount = 1) {
  // Highlight search term
  const searchTermRegex = new RegExp(`(?<!<[^>]*)${searchTerm}`, 'gi');
  files.forEach((file, index) => {
    if (!file._content) return;
    const htmlRegex = /<[^>]*(>|$)|&nbsp;|&zwnj;|&raquo;|&laquo;|&gt;/g;
    file._content = file._content.replace(htmlRegex, '');

    // Remove strange characters
    const badCharRegex = /â|Â&nbsp;|â|Â|â¢|â¢&#160|â;|â¢&#160;|âs|[^\x00-\x7F]/g;
    file._content = file._content.replace(badCharRegex, '');

    const range = [];
    range[0] = matchCount;

    file._content = file._content.replace(searchTermRegex, (match, offset) => {
      range[1] = matchCount++;
      return `<span class='highlight' id='${searchId}-${range[1]}'>${match}</span>`;
    });
    file.range = range;
    file.index = index;
  });

  return {
    files,
    totalMatchCount: matchCount - 1
  };
}

module.exports = addHighlightsHtml;