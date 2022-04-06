'use strict';

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  files: Ember.computed.alias('details.files'),
  expandableTitleStates: {},
  currentHit: 0,
  message: '',
  errorMessage: '',
  isRunningStates: {},
  init: function () {
    this.set('block._hitIndex', 0);
    this.set('block._showHighlights', true);
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

      this.sendIntegrationMessage({
        action: 'getFileContent',
        data: {
          file: outerThis.files[fileIndex],
          searchId: outerThis.details.searchId,
          entity: outerThis.get('block.entity'),
          totalMatchCount: parseInt(this.get('details.totalMatchCount'))
        }
      })
        .then(({ newFileWithContent, contentMatchCount }) => {
          outerThis.set(
            'files',
            outerThis.files
              .slice(0, fileIndex)
              .concat(newFileWithContent)
              .concat(outerThis.files.slice(fileIndex + 1))
          );

          this.set('details.totalMatchCount', contentMatchCount);
          this.set(
            `expandableTitleStates`,
            Object.assign({}, this.get('expandableTitleStates'), {
              [fileIndex]: !this.get('expandableTitleStates')[fileIndex]
            })
          );
        })
        .catch((err) => {
          outerThis.set(
            `errorMessageStates`,
            Object.assign({}, outerThis.get('errorMessageStates'), {
              [fileIndex]: `Failed on Retry: ${err.message || err.title || err.description || 'Unknown Reason'}`
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
    }
  },
  changeHit: function (amount) {
    const previousHitIndex = parseInt(this.get('block._hitIndex'));
    let hitIndex = previousHitIndex + amount;
    const total = parseInt(this.get('details.totalMatchCount'));
    if (hitIndex >= total) {
      hitIndex = total;
    } else if (hitIndex <= 1) {
      hitIndex = 1;
    }
    let prevElement = document.getElementById(`${this.details.searchId}-${hitIndex - 1}`);
    let element = document.getElementById(`${this.details.searchId}-${hitIndex}`);
    let nextElement = document.getElementById(`${this.details.searchId}-${hitIndex + 1}`);

    if (!element) {
      const newIndexToExpand = this.get('files').find(
        ({ range: [min, max] }) => hitIndex >= min && hitIndex <= max
      ).index;

      const modifiedExpandableTitleStates = Object.assign({}, this.get('expandableTitleStates'), {
        [newIndexToExpand]: true
      });

      this.set(`expandableTitleStates`, modifiedExpandableTitleStates);
      element = document.getElementById(`${this.details.searchId}-${hitIndex}`);
    }

    element.classList.add('darkened-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (prevElement) prevElement.classList.remove('darkened-highlight');
    if (nextElement) nextElement.classList.remove('darkened-highlight');

    this.set('block._hitIndex', hitIndex);
  }
});
