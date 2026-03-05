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
const { initScheduler } = require('./scheduler');

const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auction');
const bracketRoutes = require('./routes/bracket');
const standingsRoutes = require('./routes/standings');
const adminRoutes = require('./routes/admin');
const tournamentsRoutes = require('./routes/tournaments');
const exportRoutes = require('./routes/export');

const app = express();
const httpServer = createServer(app);

const corsConfig = {
  origin: process.env.NCAA_CLIENT_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
};

const io = new Server(httpServer, { cors: corsConfig });

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors(corsConfig));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/bracket', bracketRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/export', exportRoutes);
app.use('/api/tournaments', tournamentsRoutes);

// Serve React build in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Initialize DB and sockets
init();
const auctionService = createAuctionService(io);
app.set('auctionService', auctionService);
app.set('auctionModule', auctionService); // backwards compatibility
setupSocket(io, auctionService);
initScheduler(io);

const PORT = process.env.NCAA_PORT || process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Calcutta server running on port ${PORT}`);
});

let isShuttingDown = false;
let forceExitTimer = null;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}, closing server...`);

  const finish = (code) => {
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(code);
  };

  const closeHttpServer = () => {
    if (!httpServer.listening) {
      console.log('[shutdown] HTTP server already stopped');
      return finish(0);
    }

    return httpServer.close((err) => {
      if (err) {
        // During orchestrated shutdowns, the server can already be closing/stopped.
        console.warn('[shutdown] HTTP close returned error during termination; exiting cleanly', err);
        return finish(0);
      }
      console.log('[shutdown] Server closed cleanly');
      return finish(0);
    });
  };

  io.close(() => {
    closeHttpServer();
  });

  // Safety timeout in case close hangs due to open handles.
  forceExitTimer = setTimeout(() => {
    console.warn('[shutdown] Force exiting after timeout (clean exit for orchestrator stop)');
    process.exit(0);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
