import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { useTournament } from '../context/TournamentContext';
import { api, fmtGameMeta, REGION_COLORS, ROUND_NAMES_SHORT } from '../utils';

const ROUND_COLUMNS = [1, 2, 3, 4];
const REGION_ROUND_GAME_COUNTS = { 1: 8, 2: 4, 3: 2, 4: 1 };

const DESKTOP_CARD_WIDTH_PCT = 20;
const DESKTOP_CONNECTOR_WIDTH_PCT = 6.6;
const DESKTOP_COLUMN_LEFT = [0, 26.6, 53.2, 79.8];
const DESKTOP_CARD_HEIGHT = 74;
const DESKTOP_ROUND_LAYOUT = {
  1: { top: 0, step: 78 },
  2: { top: 39, step: 156 },
  3: { top: 117, step: 312 },
  4: { top: 273, step: 0 },
};
const DESKTOP_REGION_HEIGHT = (
  DESKTOP_ROUND_LAYOUT[1].top
  + ((REGION_ROUND_GAME_COUNTS[1] - 1) * DESKTOP_ROUND_LAYOUT[1].step)
  + DESKTOP_CARD_HEIGHT
);

function sortByPosition(games) {
  return [...games].sort((a, b) => a.position - b.position);
}

function getRoundGames(games, round) {
  return sortByPosition(games.filter((g) => g.round === round));
}

function getRoundGamesWithPlaceholders(games, region, round) {
  const existing = getRoundGames(games, round);
  const count = REGION_ROUND_GAME_COUNTS[round];
  if (!count) return existing;

  const byPos = new Map(existing.map((g) => [g.position, g]));
  const filled = [];
  for (let pos = 1; pos <= count; pos += 1) {
    filled.push(byPos.get(pos) || {
      id: `placeholder-${region}-${round}-${pos}`,
      round,
      region,
      position: pos,
      team1_id: null,
      team2_id: null,
      winner_id: null,
    });
  }
  return filled;
}

function TeamSlot({ teamName, teamSeed, ownerName, ownerColor, isWinner, isEmpty, compact = false }) {
  if (isEmpty) {
    return (
      <div
        className={`flex items-center px-2 rounded-lg bg-surface-input/30 border border-surface-border/50 ${compact ? 'h-6' : 'h-9'}`}
      >
        <span className={`text-text-muted ${compact ? 'text-[11px]' : 'text-xs'}`}>TBD</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between px-2 rounded-lg border transition-all ${
      compact ? 'h-6 text-[11px]' : 'h-9 text-xs'
    } ${
      isWinner
        ? 'bg-status-success/10 border-status-success/40 font-semibold ring-1 ring-status-success/20'
        : 'bg-surface-input/60 border-surface-border'
    }`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {teamSeed && (
          <span className={`shrink-0 tabular-nums ${isWinner ? 'text-status-success' : 'text-text-secondary'}`}>
            #{teamSeed}
          </span>
        )}
        <span className="truncate text-text-primary">{teamName || 'TBD'}</span>
      </div>
      {!compact && ownerName && (
        <span
          className="shrink-0 ml-1 text-xs font-medium px-1.5 py-0.5 rounded-md"
          style={{ color: ownerColor, backgroundColor: ownerColor + '22' }}
        >
          {ownerName}
        </span>
      )}
    </div>
  );
}

function GameCard({ game, compact = false, showRegion = true }) {
  const hasResult = !!game.winner_id;
  const color = REGION_COLORS[game.region] || '#6366f1';
  const gameMeta = fmtGameMeta(game.tipoff_at, game.tv_network);

  if (compact) {
    return (
      <div
        className="rounded-xl border overflow-hidden h-[74px] bg-surface-raised/70"
        style={{ borderColor: hasResult ? '#334155' : color + '55' }}
      >
        <div className="h-3.5 px-1.5 text-xs leading-none text-text-secondary/80 border-b border-surface-border/40 flex items-center overflow-hidden">
          <span className="inline-block origin-left scale-[0.68] whitespace-nowrap">
            {gameMeta || '\u00A0'}
          </span>
        </div>
        <div className="p-1 space-y-0.5">
          <TeamSlot
            compact
            teamName={game.team1_name}
            teamSeed={game.team1_seed}
            ownerName={game.team1_owner_name}
            ownerColor={game.team1_owner_color}
            isWinner={game.winner_id === game.team1_id}
            isEmpty={!game.team1_id}
          />
          <TeamSlot
            compact
            teamName={game.team2_name}
            teamSeed={game.team2_seed}
            ownerName={game.team2_owner_name}
            ownerColor={game.team2_owner_color}
            isWinner={game.winner_id === game.team2_id}
            isEmpty={!game.team2_id}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all duration-150 ${
        hasResult ? 'opacity-75 hover:opacity-90' : 'hover:shadow-md'
      }`}
      style={{ borderColor: hasResult ? '#334155' : color + '55' }}
    >
      {showRegion && (
        <div className="px-2 py-0.5 text-xs text-text-secondary flex items-center justify-between"
          style={{ backgroundColor: color + '15' }}>
          <span className="font-medium" style={{ color: color + 'cc' }}>{game.region}</span>
          {hasResult && (
            <>
              <span aria-hidden="true" className="text-status-success">✓</span>
              <span className="sr-only">Game complete</span>
            </>
          )}
        </div>
      )}
      <div className="p-1 bg-surface-raised/60 space-y-0.5">
        {gameMeta && (
          <div className="px-2 py-1 text-[11px] text-text-secondary border border-surface-border/50 rounded-lg bg-surface-input/20">
            {gameMeta}
          </div>
        )}
        <TeamSlot
          teamName={game.team1_name}
          teamSeed={game.team1_seed}
          ownerName={game.team1_owner_name}
          ownerColor={game.team1_owner_color}
          isWinner={game.winner_id === game.team1_id}
          isEmpty={!game.team1_id}
        />
        <TeamSlot
          teamName={game.team2_name}
          teamSeed={game.team2_seed}
          ownerName={game.team2_owner_name}
          ownerColor={game.team2_owner_color}
          isWinner={game.winner_id === game.team2_id}
          isEmpty={!game.team2_id}
        />
      </div>
    </div>
  );
}

function MobileRegionBracket({ region, games }) {
  const color = REGION_COLORS[region];
  return (
    <div className="card p-4">
      <h3
        className="text-sm font-bold uppercase tracking-wider mb-4 pl-3"
        style={{ color, borderLeft: `4px solid ${color}` }}
      >
        {region} Region
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROUND_COLUMNS.map((round) => {
          const roundGames = getRoundGamesWithPlaceholders(games, region, round);
          return (
            <div key={round}>
              <div className="section-label text-center mb-2">
                {ROUND_NAMES_SHORT[round]}
              </div>
              <div className="space-y-2">
                {roundGames.map((g) => <GameCard key={g.id} game={g} compact />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopRegionBracket({ region, games, mirror = false }) {
  const color = REGION_COLORS[region];
  const roundsForLabels = mirror ? [4, 3, 2, 1] : [1, 2, 3, 4];

  return (
    <section className="py-2">
      <h3
        className="text-sm font-bold uppercase tracking-wider mb-2 pl-3"
        style={{ color, borderLeft: `4px solid ${color}` }}
      >
        {region} Region
      </h3>

      <div className="grid gap-0.5 mb-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {roundsForLabels.map((round) => (
          <div key={round} className="section-label text-center text-[10px]">
            {ROUND_NAMES_SHORT[round]}
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden" style={{ height: DESKTOP_REGION_HEIGHT }}>
        {ROUND_COLUMNS.map((round, roundIdx) => {
          const roundGames = getRoundGamesWithPlaceholders(games, region, round);
          const layout = DESKTOP_ROUND_LAYOUT[round];
          const colIndex = mirror ? (ROUND_COLUMNS.length - 1 - roundIdx) : roundIdx;
          const leftPct = DESKTOP_COLUMN_LEFT[colIndex];
          const hasNext = round < 4;

          return roundGames.map((game, idx) => {
            const top = layout.top + (idx * layout.step);
            const pairSpan = layout.step / 2;
            const hasPair = hasNext && layout.step > 0 && (
              (idx % 2 === 0 && idx + 1 < roundGames.length) ||
              (idx % 2 === 1 && idx - 1 >= 0)
            );

            return (
              <div
                key={game.id}
                className="absolute"
                style={{ left: `${leftPct}%`, top, width: `${DESKTOP_CARD_WIDTH_PCT}%` }}
              >
                <GameCard game={game} compact showRegion={false} />

                {hasNext && (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-px bg-surface-border/85 ${mirror ? 'right-full' : 'left-full'}`}
                    style={{ width: `${DESKTOP_CONNECTOR_WIDTH_PCT}%` }}
                  />
                )}

                {hasPair && idx % 2 === 0 && (
                  <div
                    className="absolute w-px bg-surface-border/75"
                    style={{
                      height: pairSpan,
                      top: '50%',
                      ...(mirror
                        ? { right: `calc(100% + ${DESKTOP_CONNECTOR_WIDTH_PCT}%)` }
                        : { left: `calc(100% + ${DESKTOP_CONNECTOR_WIDTH_PCT}%)` }),
                    }}
                  />
                )}

                {hasPair && idx % 2 === 1 && (
                  <div
                    className="absolute w-px bg-surface-border/75"
                    style={{
                      height: pairSpan,
                      bottom: '50%',
                      ...(mirror
                        ? { right: `calc(100% + ${DESKTOP_CONNECTOR_WIDTH_PCT}%)` }
                        : { left: `calc(100% + ${DESKTOP_CONNECTOR_WIDTH_PCT}%)` }),
                    }}
                  />
                )}
              </div>
            );
          });
        })}
      </div>
    </section>
  );
}

function DesktopFinalWeekend({ finalFour, championship }) {
  const sortedFinalFour = sortByPosition(finalFour);

  return (
    <section className="py-4 border-y border-surface-border/60 my-1">
      <h3 className="section-label text-brand mb-4 text-center">Final Weekend</h3>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="space-y-2">
          <div className="section-label text-center">Final Four A</div>
          {sortedFinalFour[0] ? (
            <GameCard game={sortedFinalFour[0]} compact showRegion={false} />
          ) : (
            <div className="text-center text-text-muted text-xs">TBD</div>
          )}
        </div>

        <div className="min-w-[220px]">
          <div className="section-label text-center mb-2">Championship</div>
          {championship?.[0] ? (
            <GameCard game={championship[0]} showRegion={false} />
          ) : (
            <div className="rounded-xl border border-surface-border bg-surface-raised/50 p-4 text-center text-text-muted text-xs">
              TBD
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="section-label text-center">Final Four B</div>
          {sortedFinalFour[1] ? (
            <GameCard game={sortedFinalFour[1]} compact showRegion={false} />
          ) : (
            <div className="text-center text-text-muted text-xs">TBD</div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Bracket() {
  const { isViewingHistory, apiTParam, refreshKey } = useTournament() ?? {};
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isDesktopBracket, setIsDesktopBracket] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  const loadGames = useCallback(() => {
    api(`/bracket${apiTParam || ''}`)
      .then((r) => r.json())
      .then((data) => {
        setGames(data.games || []);
        setInitialized((data.games || []).length > 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiTParam]);

  useEffect(() => { loadGames(); }, [loadGames, refreshKey]);

  const handleBracketUpdate = useCallback(() => {
    if (!isViewingHistory) loadGames();
  }, [loadGames, isViewingHistory]);

  useSocketEvent('bracket:update', handleBracketUpdate);
  useSocketEvent('bracket:initialized', handleBracketUpdate);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesktopBracket(e.matches);
    setIsDesktopBracket(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8" role="status" aria-label="Loading bracket">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
            <span aria-hidden="true" className="text-3xl leading-none">🏆</span>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Tournament Not Started</h2>
          <p className="text-text-secondary">The admin will initialize the bracket once the auction is complete.</p>
        </div>
      </div>
    );
  }

  const regionGames = {};
  for (const region of ['East', 'West', 'South', 'Midwest']) {
    regionGames[region] = games.filter((g) => g.region === region);
  }

  const finalFour = sortByPosition(games.filter((g) => g.region === 'Final Four'));
  const championship = sortByPosition(games.filter((g) => g.region === 'Championship'));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Tournament Bracket</h1>

      {isDesktopBracket ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-8">
            <DesktopRegionBracket region="South" games={regionGames.South || []} />
            <DesktopRegionBracket region="East" games={regionGames.East || []} mirror />
          </div>

          <DesktopFinalWeekend finalFour={finalFour} championship={championship} />

          <div className="grid grid-cols-2 gap-x-8">
            <DesktopRegionBracket region="West" games={regionGames.West || []} />
            <DesktopRegionBracket region="Midwest" games={regionGames.Midwest || []} mirror />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 mb-6">
            {['East', 'West', 'South', 'Midwest'].map((region) => (
              <MobileRegionBracket key={region} region={region} games={regionGames[region] || []} />
            ))}
          </div>

          {(finalFour.length > 0 || championship.length > 0) && (
            <div className="card-elevated ring-1 ring-brand/20 p-6">
              <h3 className="section-label text-brand mb-4">Final Weekend</h3>
              <div className="flex gap-6 flex-wrap">
                {finalFour.length > 0 && (
                  <div>
                    <div className="section-label mb-2">Final Four</div>
                    <div className="space-y-2">
                      {finalFour.map((g) => <GameCard key={g.id} game={g} compact />)}
                    </div>
                  </div>
                )}
                {championship.length > 0 && (
                  <div>
                    <div className="section-label mb-2">Championship</div>
                    <div className="space-y-2">
                      {championship.map((g) => <GameCard key={g.id} game={g} compact />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
