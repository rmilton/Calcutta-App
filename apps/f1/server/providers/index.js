const { MockResultsProvider } = require('./mockResultsProvider');

function createResultsProvider() {
  const provider = process.env.F1_RESULTS_PROVIDER || 'mock';
  if (provider !== 'mock') {
    console.warn(`[results provider] Unsupported provider "${provider}" configured. Falling back to mock.`);
  }
  return new MockResultsProvider();
}

module.exports = { createResultsProvider };
