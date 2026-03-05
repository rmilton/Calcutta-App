function parseForceFlag(req) {
  return req.query?.force === '1' || req.body?.force === true;
}

function parseIntegerParam(raw) {
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function runAndRespond(res, result, onSuccess) {
  if (!result?.ok) {
    return res.status(result?.status || 500).json({ error: result?.error || 'Request failed' });
  }

  if (typeof onSuccess === 'function') {
    return res.json(onSuccess(result));
  }

  return res.json(result);
}

module.exports = {
  parseForceFlag,
  parseIntegerParam,
  runAndRespond,
};
