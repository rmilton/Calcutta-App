const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { init } = require('./db');
const { setupSocket } = require('./socket');
const { createAuctionService } = require('./services/auctionService');
const { createResultsProvider } = require('./providers');
const { rescoreSeasonEvents } = require('./services/scoringService');

const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auction');
const standingsRoutes = require('./routes/standings');
const eventsRoutes = require('./routes/events');
const adminRoutes = require('./routes/admin');

const app = express();
const httpServer = createServer(app);

const corsConfig = {
  origin: process.env.F1_CLIENT_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5174',
  credentials: true,
};

const io = new Server(httpServer, {
  cors: corsConfig,
});

app.set('io', io);

app.use(cors(corsConfig));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/admin', adminRoutes);

const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

const initResult = init();
const auctionService = createAuctionService(io);
auctionService.restoreTimerOnStartup();
app.set('auctionService', auctionService);
app.set('resultsProvider', createResultsProvider());
setupSocket(io, auctionService);

if (initResult?.payoutModelMigrated) {
  const rescore = rescoreSeasonEvents({ seasonId: initResult.activeSeasonId });
  if (!rescore.ok) {
    console.error('[payout-model-v2] Failed to rescore season events', rescore);
  } else {
    io.emit('standings:update');
    console.log(`[payout-model-v2] Rescored ${rescore.rescoredEvents} events for season ${initResult.activeSeasonId}`);
  }
}

const PORT = process.env.F1_PORT || process.env.PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`F1 Calcutta server running on port ${PORT}`);
});

let isShuttingDown = false;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[shutdown] Received ${signal}, closing server...`);

  io.close(() => {
    httpServer.close((err) => {
      if (err) {
        console.error('[shutdown] HTTP close failed', err);
        process.exit(1);
      }
      process.exit(0);
    });
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
