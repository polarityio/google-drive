'use strict';

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  files: Ember.computed.alias('details.files'),
  expandableTitleStates: {},
  currentHit: 0,
  init: function () {
    this.set('block._hitIndex', 0);
    this.set('block._showHighlights', true);
    this._super('...arguments');
  },
  actions: {
    toggleExpandableTitle: function (index) {
      const modifiedExpandableTitleStates = Object.assign({}, this.get('expandableTitleStates'), {
        [index]: !this.get('expandableTitleStates')[index]
      });

      this.set(`expandableTitleStates`, modifiedExpandableTitleStates);
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
      const newIndexToExpand = this.get('files').find(({ range: [min, max] }) => hitIndex >= min && hitIndex <= max).index;
      
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
