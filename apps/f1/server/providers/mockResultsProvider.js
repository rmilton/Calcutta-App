const { DRIVERS_2026 } = require('../data/drivers2026');
const { EVENTS_2026 } = require('../data/events2026');

function seededHash(input) {
  let x = Math.sin(input * 999.1234) * 100000;
  return x - Math.floor(x);
}

class MockResultsProvider {
  constructor() {
    this.name = 'mock';
  }

  async fetchDrivers() {
    return DRIVERS_2026;
  }

  async fetchSeasonSchedule() {
    return EVENTS_2026.map((e) => ({
      external_event_id: `mock-${e.round_number}`,
      ...e,
    }));
  }

  async fetchEventResults({ event, drivers }) {
    const driverList = (drivers || DRIVERS_2026).map((d) => ({
      external_id: d.external_id,
    }));

    const finishOrder = [...driverList].sort((a, b) => (
      seededHash((event.round_number * 1000) + a.external_id)
      - seededHash((event.round_number * 1000) + b.external_id)
    ));

    const startOrder = [...driverList].sort((a, b) => (
      seededHash((event.round_number * 2000) + a.external_id)
      - seededHash((event.round_number * 2000) + b.external_id)
    ));

    const startPos = new Map(startOrder.map((driver, idx) => [driver.external_id, idx + 1]));

    return finishOrder.map((driver, idx) => ({
      external_driver_id: driver.external_id,
      finish_position: idx + 1,
      start_position: startPos.get(driver.external_id),
    }));
  }

  getStatus() {
    return {
      provider: this.name,
      mode: 'mock',
    };
  }
}

module.exports = { MockResultsProvider };
