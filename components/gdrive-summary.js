'use strict';

polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  init() {
    const files = this.get('details.files');
    this.set('fileTags', files.slice(0, 2).concat(files.length > 2 ? { name: `+${files.length - 2} more files` } : []));
    this._super(...arguments);
  }
});
