function computeBidEndTime({ nowMs, timerSeconds }) {
  return nowMs + (Number(timerSeconds) || 0) * 1000;
}

function extendBidEndTime({ nowMs, existingEndTime, graceSeconds }) {
  const graceEndTime = nowMs + (Number(graceSeconds) || 0) * 1000;
  return Math.max(graceEndTime, Number(existingEndTime) || 0);
}

module.exports = {
  computeBidEndTime,
  extendBidEndTime,
};
