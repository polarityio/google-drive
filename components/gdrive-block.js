'use strict';

const parseErrorToReadableJSON = (error) => JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  files: Ember.computed.alias('details.files'),
  expandableTitleStates: {},
  currentHit: 0,
  message: '',
  errorMessage: '',
  isRunningStates: {},
  gettingAFileRunning: false,
  moreFilesToOpen: true,
  init: function () {
    this.set('block._hitIndex', 0);
    this.set('block._showHighlights', true);
    this.set('details.totalMatchCount', '?');

    this._super('...arguments');
  },
  actions: {
    toggleExpandableTitle: function (index) {
      this.set(
        `expandableTitleStates`,
        Object.assign({}, this.get('expandableTitleStates'), {
          [index]: !this.get('expandableTitleStates')[index]
        })
      );
    },
    jumpToHit: function () {
      const element = document.getElementById(this.details.searchId);
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    previousHit: function () {
      this.changeHit(-1);
    },
    nextHit: function () {
      this.changeHit(1);
    },
    getFileContent: function (fileIndex) {
      this.getFileContent(fileIndex);
    }
  },
  getFileContent: function (fileIndex) {
    if(this.get('gettingAFileRunning')) return; 
    this.set('gettingAFileRunning', true);
    const outerThis = this;
    outerThis.set(
      `errorMessageStates`,
      Object.assign({}, outerThis.get('errorMessageStates'), {
        [fileIndex]: ''
      })
    );
    outerThis.set(
      `isRunningStates`,
      Object.assign({}, outerThis.get('isRunningStates'), {
        [fileIndex]: true
      })
    );

    const totalMatchCount = parseInt(
      this.get('details.totalMatchCount') === '?' ? 0 : this.get('details.totalMatchCount')
    );

    this.sendIntegrationMessage({
      action: 'getFileContent',
      data: {
        file: outerThis.files[fileIndex],
        searchId: outerThis.details.searchId,
        entity: outerThis.get('block.entity'),
        totalMatchCount
      }
    })
      .then(({ newFileWithContent, contentMatchCount }) => {
        const files =
          (outerThis.files || [])
            .slice(0, fileIndex)
            .concat(newFileWithContent)
            .concat((outerThis.files || []).slice(fileIndex + 1)) || [];
        
        outerThis.set('files', files);

        this.set('details.totalMatchCount', contentMatchCount);
        this.set(
          `expandableTitleStates`,
          Object.assign({}, this.get('expandableTitleStates'), {
            [fileIndex]: !this.get('expandableTitleStates')[fileIndex]
          })
        );
        outerThis.set(
          'moreFilesToOpen',
          files.findIndex((file) => file._content === 'useOnMessageFileContentLookup') !== -1
        );
      })
      .catch((error) => {
        const err = parseErrorToReadableJSON(error);
        outerThis.set(
          `errorMessageStates`,
          Object.assign({}, outerThis.get('errorMessageStates'), {
            [fileIndex]: `Failed to get File Content:\n${JSON.stringify(err) || 'Unknown Reason'}`
          })
        );
      })
      .finally(() => {
        outerThis.set(
          `isRunningStates`,
          Object.assign({}, outerThis.get('isRunningStates'), {
            [fileIndex]: false
          })
        );

        this.set('gettingAFileRunning', false);

        outerThis.get('block').notifyPropertyChange('data');
        setTimeout(() => {
          outerThis.set(
            `errorMessageStates`,
            Object.assign({}, outerThis.get('errorMessageStates'), {
              [fileIndex]: ''
            })
          );
          outerThis.get('block').notifyPropertyChange('data');
        }, 5000);
      });
  },
  changeHit: function (amount) {
    const previousHitIndex = parseInt(this.get('block._hitIndex'));
    let hitIndex = previousHitIndex + amount;
    const noMatchesYet = this.get('details.totalMatchCount') === '?';
    if (noMatchesYet) {
      this.getFileContent(0);
    }

    const total = parseInt(this.get('details.totalMatchCount'));
    if (hitIndex >= total) {
      const nextFileToOpenIndex =
        (this.get('files') || []).findIndex((file) => file._content === 'useOnMessageFileContentLookup');

      if (nextFileToOpenIndex !== -1) {
        this.getFileContent(nextFileToOpenIndex);
      }
      hitIndex = total;
    } else if (hitIndex <= 1) {
      hitIndex = 1;
    }
    let prevElement = document.getElementById(`${this.details.searchId}-${hitIndex - 1}`);
    let element = document.getElementById(`${this.details.searchId}-${hitIndex}`);
    let nextElement = document.getElementById(`${this.details.searchId}-${hitIndex + 1}`);

    if (!element) {
      const newIndexToExpand = (this.get('files') || []).find(
        ({ range: [min, max] }) => hitIndex >= min && hitIndex <= max
      ).index;

      this.set(
        `expandableTitleStates`,
        Object.assign({}, this.get('expandableTitleStates'), {
          [newIndexToExpand]: true
        })
      );

      this.get('block').notifyPropertyChange('data');

      element = document.getElementById(`${this.details.searchId}-${hitIndex}`);
    }

    element.classList.add('darkened-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (prevElement) prevElement.classList.remove('darkened-highlight');
    if (nextElement) nextElement.classList.remove('darkened-highlight');

    this.set('block._hitIndex', hitIndex);
  }
});
