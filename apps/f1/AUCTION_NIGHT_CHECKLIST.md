# F1 Auction Night Checklist

Last updated: 2026-03-06
Owner: Ryan Milton / active operator

Use this checklist for the live auction setup and launch of the F1 app.

## 1. Production Readiness

- Confirm Railway F1 service is healthy.
- Confirm the F1 service root is `apps/f1`.
- Confirm `/api/health` returns OK.
- Confirm SQLite volume is attached and `DB_PATH=/data/f1-calcutta.db`.
- Confirm Railway env vars:
  - `ADMIN_PASSWORD`
  - `NODE_ENV=production`
  - `F1_RESULTS_PROVIDER=openf1`
  - `OPENF1_USERNAME`
  - `OPENF1_PASSWORD`
- Confirm `F1_PORT` is **not** set in Railway.
- Confirm `F1_AUTO_POLL_ENABLED=0`.
- Download a fresh DB backup from `Admin -> Results Sync -> Download DB Backup`.

## 2. Admin Setup

- Log in as admin.
- Open `Admin -> Results Sync`.
- Confirm `Active Provider` shows `openf1`.
- Click `Refresh Drivers` once.
- Review the driver list carefully.
- Click `Refresh Schedule` once.
- Confirm the schedule looks correct for the season.

Important:
- After the real auction starts, do **not** run `Refresh Drivers` again unless you intentionally want to change the auction roster.

## 3. Auction Configuration

- Open `Admin -> Auction`.
- Set and save:
  - timer seconds
  - grace seconds
  - auto advance on/off
  - participant cap
- Confirm participant cap is correct for the pool.
- Confirm payout rules are final and locked in `Admin -> Payout Rules`.

Recommended default:
- Participant cap defaults to `$200`, but confirm the live setting before people join.

## 4. Participant Join Check

- Have 1-2 test participants join the live deployment.
- Open `Admin -> Auction`.
- Confirm they appear in `Joined Participants`.
- Confirm participant names/colors look correct.
- Confirm admin is not shown as a bidding participant.

## 5. Auction Smoke Test

- Open one driver.
- Place at least two bids from different participants.
- Confirm:
  - live price updates
  - bid clock updates
  - sold driver closes correctly
  - sold drivers list updates
  - participant remaining budget updates
  - My Drivers reflects the purchase
- Confirm admin controls still work:
  - Pause
  - Start Next Driver
  - Close Active

## 6. Reset Before Real Auction

If the smoke test used the real production deployment:

- Open `Admin -> Test Data`.
- Click `Reset Auction Only`.
- Confirm:
  - bids are cleared
  - sold drivers are cleared
  - ownership is cleared
  - participants remain joined
  - results/payouts remain untouched

Do **not** use `Clear All Test Data` unless you intentionally want to remove joined participants too.

## 7. Live Auction Start

- Reconfirm all expected participants have joined.
- Reconfirm participant cap.
- Reconfirm payout rules are final.
- Announce house rules before opening the first driver.
- Open the first driver.
- Monitor:
  - joined participants
  - live bid clock
  - sold driver updates
  - participant remaining budgets

## 8. After The Real Auction

- Open `Admin -> Auction`.
- Click `Lock Season Roster`.
- Confirm the roster now shows as locked.
- Confirm `Admin -> Results Sync` shows the roster as frozen.

This makes it explicit that the season driver roster should no longer be refreshed casually after the real auction.

## 9. Season Operations Rule

Use this as the standing policy after the auction:

- Auction roster is frozen once the real auction starts.
- If OpenF1 later includes a substitute or newly appearing race driver:
  - that driver is preserved in event results
  - that driver is not automatically auctioned
  - that driver is treated as unowned
  - any payout tied to that driver remains undistributed

## 10. First Race Weekend Scoring

Before syncing the first real event:

- Open `Admin -> Results Sync`.
- Confirm provider status is healthy.
- Confirm event list still matches expectation.
- Sync manually first.
- Leave auto-poll off until after one successful production scoring run.

## 11. Recovery Actions

Use these only if needed:

- `Reset Auction Only`
  - clears bids, sold drivers, and ownership
  - keeps participants
- `Clear All Test Data`
  - clears auction activity, participants, results, payouts, and provider sync state
- `Restore 2026 Drivers + Events`
  - restores canonical seeded metadata
  - destructive to current active season test state
- `Rescore All Scored Events`
  - rebuilds scored event payouts and season bonuses under current payout rules

## 12. If Something Goes Wrong

- Check `Admin -> Results Sync -> Active Provider`.
- Check Railway deployment logs for the current deployment ID.
- Verify OpenF1 credentials are still present in Railway.
- If auction state looks wrong during rehearsal, use `Reset Auction Only`.
- If OpenF1 sync fails during a live session:
  - wait briefly
  - retry once
  - use manual results entry if provider responses are incomplete

## 13. Final Go/No-Go

You are ready to start the real auction only if all are true:

- production deployment is healthy
- admin login works
- participants can join
- joined participant list updates
- one full auction smoke test succeeded
- auction reset completed cleanly
- drivers/schedule were refreshed once and reviewed
- payout rules are final
- participant cap is correct
