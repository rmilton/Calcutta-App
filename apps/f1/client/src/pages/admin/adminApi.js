import { api } from '../../utils.js';

async function parseApiResponse(response, fallbackMessage) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

export function normalizeSettingsPayload(settings) {
  return {
    auction_timer_seconds: Number(settings?.auction_timer_seconds) || 30,
    auction_grace_seconds: Number(settings?.auction_grace_seconds) || 15,
    auction_auto_advance: settings?.auction_auto_advance ? 1 : 0,
  };
}

export function normalizeRulesPayload(rules) {
  return {
    grand_prix: (rules?.grand_prix || []).map((rule) => ({ ...rule, bps: Number(rule.bps) || 0 })),
    sprint: (rules?.sprint || []).map((rule) => ({ ...rule, bps: Number(rule.bps) || 0 })),
    season_bonus: (rules?.season_bonus || []).map((rule) => ({ ...rule, bps: Number(rule.bps) || 0 })),
  };
}

export function syncNextEndpoint(force = false) {
  return force ? '/admin/results/advance-next' : '/admin/results/sync-next';
}

export async function readApi(path) {
  const response = await api(path);
  return parseApiResponse(response, 'Request failed');
}

export async function patchSettings(payload) {
  const response = await api('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'Failed to save settings');
}

export async function runAuctionAction(endpoint) {
  const response = await api(endpoint, { method: 'POST', body: '{}' });
  return parseApiResponse(response, 'Auction action failed');
}

export async function syncNext({ force = false } = {}) {
  const response = await api(syncNextEndpoint(force), { method: 'POST', body: '{}' });
  return parseApiResponse(response, 'Sync failed');
}

export async function syncEvent(eventId, { force = false } = {}) {
  const response = await api(`/admin/results/sync-event/${eventId}`, {
    method: 'POST',
    body: JSON.stringify(force ? { force: true } : {}),
  });
  return parseApiResponse(response, 'Event sync failed');
}

export async function recalcSeasonBonuses() {
  const response = await api('/admin/results/recalc-season-bonuses', {
    method: 'POST',
    body: '{}',
  });
  return parseApiResponse(response, 'Recalculation failed');
}

export async function savePayoutRules(payload) {
  const response = await api('/admin/payout-rules', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'Failed to save payout rules');
}
