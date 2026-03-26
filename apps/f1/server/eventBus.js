'use strict';

const { EventEmitter } = require('events');

// Internal event bus for cross-service communication within the F1 server.
// Events emitted here:
//   'event:scored' — { seasonId, eventId } — fired after an event is fully scored
const eventBus = new EventEmitter();

module.exports = eventBus;
