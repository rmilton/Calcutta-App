function sanitizeParticipantName(name) {
  return String(name || '').trim().substring(0, 32);
}

function generateInviteCode(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

function computeBidEndTime({ nowMs, timerSeconds }) {
  return nowMs + (Number(timerSeconds) || 0) * 1000;
}

function extendBidEndTime({ nowMs, existingEndTime, graceSeconds }) {
  const graceEndTime = nowMs + (Number(graceSeconds) || 0) * 1000;
  return Math.max(graceEndTime, Number(existingEndTime) || 0);
}

function amountFromBps(totalCents, bps) {
  return Math.round(((Number(totalCents) || 0) * (Number(bps) || 0)) / 10000);
}

function splitCentsEvenly(totalCents, count) {
  if (!count || count < 1) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, idx) => base + (idx < remainder ? 1 : 0));
}

function allocateByBps(totalCents, entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!safeEntries.length) return [];

  const weighted = safeEntries.map((entry, idx) => ({
    ...entry,
    idx,
    raw: ((Number(totalCents) || 0) * (Number(entry.bps) || 0)) / 10000,
  }));

  let assigned = 0;
  const rounded = weighted.map((w) => {
    const cents = Math.floor(w.raw);
    assigned += cents;
    return { ...w, cents };
  });

  let remainder = Math.max(0, (Number(totalCents) || 0) - assigned);

  rounded
    .slice()
    .sort((a, b) => {
      const fracA = a.raw - Math.floor(a.raw);
      const fracB = b.raw - Math.floor(b.raw);
      if (fracB !== fracA) return fracB - fracA;
      return a.idx - b.idx;
    })
    .forEach((entry) => {
      if (remainder > 0) {
        const target = rounded.find((r) => r.idx === entry.idx);
        target.cents += 1;
        remainder -= 1;
      }
    });

  return rounded
    .sort((a, b) => a.idx - b.idx)
    .map(({ idx, raw, ...rest }) => rest);
}

module.exports = {
  sanitizeParticipantName,
  generateInviteCode,
  computeBidEndTime,
  extendBidEndTime,
  amountFromBps,
  splitCentsEvenly,
  allocateByBps,
};
