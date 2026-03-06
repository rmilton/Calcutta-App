const { MockResultsProvider } = require('./mockResultsProvider');
const { OpenF1ResultsProvider } = require('./openF1ResultsProvider');
const { UnsupportedResultsProvider } = require('./unsupportedResultsProvider');

function createResultsProvider() {
  const provider = process.env.F1_RESULTS_PROVIDER
    || (process.env.NODE_ENV === 'production' ? 'openf1' : 'mock');

  if (provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      return new UnsupportedResultsProvider({
        providerName: provider,
        reason: 'Mock provider is disabled in production. Configure F1_RESULTS_PROVIDER=openf1.',
      });
    }
    return new MockResultsProvider();
  }

  if (provider === 'openf1') {
    return new OpenF1ResultsProvider({
      baseUrl: process.env.OPENF1_BASE_URL,
      tokenUrl: process.env.OPENF1_TOKEN_URL,
      username: process.env.OPENF1_USERNAME,
      password: process.env.OPENF1_PASSWORD,
    });
  }

  return new UnsupportedResultsProvider({
    providerName: provider,
    reason: `Unsupported results provider "${provider}" configured.`,
  });
}

module.exports = { createResultsProvider };
