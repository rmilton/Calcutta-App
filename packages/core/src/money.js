function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

function formatUsdFromCents(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));
}

function percentToBps(percent) {
  return Math.round((Number(percent) || 0) * 100);
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
  toCents,
  fromCents,
  formatUsdFromCents,
  percentToBps,
  amountFromBps,
  splitCentsEvenly,
  allocateByBps,
};
