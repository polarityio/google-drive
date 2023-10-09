'use strict';

polarity.export = PolarityComponent.extend({
  polarityx: Ember.inject.service('polarityx'),
  details: Ember.computed.alias('block.data.details'),
  files: Ember.computed.alias('details.files'),
  // minimum amount of time we want the spinner to spin to ensure it doesn't just flash
  // on screen when the network request resolves quickly
  minimumAnimationTime: 2000,
  // Amount of time we show a search spinner
  searchAnimationTime: 4000,
  // Number of milliseconds to wait between each auth verification request
  verifyAuthInterval: 5000,
  verifyAuthPollingId: null,
  isAuthenticated: false,
  isVerifying: false,
  actions: {
    openAuthLink: function () {
      this.safeSet('authLinkClicked', true);
      this.startVerifyAuthPolling();
    },
    verifyAuth: function () {
      this.checkAuthentication();
    },
    runSearch: function () {
      this.search(this.get('details.entities'));
    }
  },
  search: function (entities) {
    if (Array.isArray(entities)) {
      if (this.polarityx && typeof this.polarityx.requestOnDemandLookup === 'function') {
        this.safeSet('searchRunning', true);
        this.polarityx.requestOnDemandLookup(entities.map((entity) => entity.value).join(' '));
        setTimeout(() => {
          if (!this.get('isDestroyed')) {
            this.safeSet('searchRunning', false);
          }
        }, this.searchAnimationTime);
      }
    }
  },
  checkAuthentication: function () {
    console.info('Verifying Auth');
    this.safeSet('isVerifying', true);
    const startTime = Date.now();
    return this.sendIntegrationMessage({ action: 'VERIFY_AUTH', stateToken: this.get('details.stateToken') })
      .then((result) => {
        if (!result.isAuthenticated && result.isExpired) {
          // not authenticated and the token is expired
          this.stopVerifyAuthPolling();
          this.safeSet('tokenExpired', true);
        } else if (result.isAuthenticated) {
          console.info('User is authenticated');
          this.safeSet('isAuthenticated', true);
          this.stopVerifyAuthPolling();
          this.search(this.get('details.entities'));
        } else {
          console.info('User is NOT authenticated');
          this.safeSet('isAuthenticated', false);
        }
        return result.isAuthenticated;
      })
      .catch((err) => {
        console.error(err);
        this.stopVerifyAuthPolling();
      })
      .finally(() => {
        const endTime = Date.now();
        if (startTime - endTime < this.minimumAnimationTime) {
          setTimeout(() => {
            if (!this.get('isDestroyed')) {
              this.safeSet('isVerifying', false);
            }
          }, this.minimumAnimationTime - (endTime - startTime));
        } else {
          this.safeSet('isVerifying', false);
        }
      });
  },
  startVerifyAuthPolling() {
    // starts the polling by executing the `isAuthenticated` method but only
    // if the polling hasn't already been started.
    if (this.verifyAuthPollingId === null) {
      this.verifyAuthPollingId = setInterval(() => {
        this.checkAuthentication();
      }, this.verifyAuthInterval);
    }
  },
  stopVerifyAuthPolling() {
    console.info('Stopping Verify Auth Polling');
    if (this.verifyAuthPollingId) {
      // If the searchIntervalId has been set then clear the interval so we don't
      // keep polling forever.
      clearInterval(this.verifyAuthPollingId);
    }
    // Reset our variables
    this.verifyAuthPollingId = null;
  },
  /**
   * willDestroyElement is triggered when the component detects that it is time to remove
   * itself from the DOM.  When this happens, we want to make sure we clear our search
   * interval if it was set.
   */
  willDestroyElement() {
    this.stopVerifyAuthPolling();
  },
  /**
   * Due to the polling, it's possible that the component will be destroyed before the
   * polling interval is cleared.  This method will check to make sure the component
   * is not destroyed before attempting to set the value.
   * @param key
   * @param value
   */
  safeSet(key, value) {
    if (!this.get('isDestroyed')) {
      this.set(key, value);
    }
  }
});
