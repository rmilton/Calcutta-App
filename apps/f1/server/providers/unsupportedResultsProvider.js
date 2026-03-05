class UnsupportedResultsProvider {
  constructor({ providerName, reason }) {
    this.name = providerName || 'unsupported';
    this.reason = reason || `Unsupported provider "${providerName}"`;
  }

  async fetchDrivers() {
    throw new Error(this.reason);
  }

  async fetchSeasonSchedule() {
    throw new Error(this.reason);
  }

  async fetchEventResults() {
    throw new Error(this.reason);
  }

  getStatus() {
    return {
      provider: this.name,
      error: this.reason,
    };
  }
}

module.exports = { UnsupportedResultsProvider };
