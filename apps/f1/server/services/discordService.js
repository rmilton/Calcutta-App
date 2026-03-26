'use strict';

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const eventBus = require('../eventBus');
const {
  getActiveSeasonId,
  getStandings,
  getEvents,
  getEventById,
  getEventPayouts,
  getEventPayoutRules,
  getSeasonBonusRules,
} = require('../db');
const { drawEventRandomBonusPosition } = require('./scoringService');

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL = {
  race_winner: 'Race Winner',
  sprint_winner: 'Sprint Winner',
  second_place: '2nd Place',
  third_place: '3rd Place',
  best_p6_or_lower: 'Best P6+',
  best_p11_or_lower: 'Best P11+',
  most_positions_gained: 'Most Positions Gained',
  slowest_pit_stop: 'Slowest Pit Stop',
  second_most_positions_gained: '2nd Most Positions Gained',
  random_finish_bonus: 'Random Position Bonus',
  drivers_champion: 'Drivers Champion',
  most_race_wins: 'Most Race Wins',
  most_top10_outside_top4: 'Most Top-10 Outside Top 4',
  season_random_finish_position: 'Season Random Standing',
  biggest_single_race_climb: 'Biggest Single-Race Climb',
};

const CATEGORY_EMOJI = {
  race_winner: '🥇',
  sprint_winner: '🏎️',
  second_place: '🥈',
  third_place: '🥉',
  best_p6_or_lower: '📍',
  best_p11_or_lower: '📌',
  most_positions_gained: '📈',
  second_most_positions_gained: '📊',
  slowest_pit_stop: '🐌',
  random_finish_bonus: '🎲',
  drivers_champion: '🏆',
  most_race_wins: '🏆',
  most_top10_outside_top4: '💯',
  season_random_finish_position: '🎯',
  biggest_single_race_climb: '🚀',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dollars(cents) {
  return `$${Math.round(Number(cents || 0) / 100)}`;
}

function fmtNet(earnedCents, spentCents) {
  const net = Math.round((Number(earnedCents || 0) - Number(spentCents || 0)) / 100);
  return `${net >= 0 ? '+' : '−'}$${Math.abs(net)}`;
}

function cleanEventName(name) {
  return String(name || '').replace(/\s*\(sprint\)\s*/gi, '').trim();
}

function eventTypeLabel(type) {
  return type === 'sprint' ? 'Sprint' : 'Grand Prix';
}

function truncate(str, max = 1950) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// ─── Slash command definitions ────────────────────────────────────────────────

function buildCommandDefinitions() {
  return [
    new SlashCommandBuilder()
      .setName('draw')
      .setDescription('Draw the random bonus finish position for an upcoming event')
      .addIntegerOption((opt) =>
        opt
          .setName('round')
          .setDescription('Round number (defaults to the next event without a draw)')
          .setRequired(false)
          .setMinValue(1)
      ),
    new SlashCommandBuilder()
      .setName('standings')
      .setDescription('Show current pool standings'),
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('Show the 2026 race schedule'),
    new SlashCommandBuilder()
      .setName('payouts')
      .setDescription('Show payouts for a scored event')
      .addIntegerOption((opt) =>
        opt
          .setName('round')
          .setDescription('Round number (defaults to the most recent scored event)')
          .setRequired(false)
          .setMinValue(1)
      ),
    new SlashCommandBuilder()
      .setName('ask')
      .setDescription('Ask the pool AI about rules, standings, schedule, payouts, anything')
      .addStringOption((opt) =>
        opt.setName('question').setDescription('Your question').setRequired(true)
      ),
  ].map((cmd) => cmd.toJSON());
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createDiscordService() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APP_ID;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !appId) {
    const missing = [!token && 'DISCORD_BOT_TOKEN', !appId && 'DISCORD_APP_ID'].filter(Boolean);
    console.log(`[discord] Disabled — missing env vars: ${missing.join(', ')}`);
    return { start: async () => {}, stop: () => {} };
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // ── Command handlers ────────────────────────────────────────────────────────

  async function handleDraw(interaction) {
    const seasonId = getActiveSeasonId();
    const roundParam = interaction.options.getInteger('round');

    const events = getEvents(seasonId);
    let target;

    if (roundParam != null) {
      target = events.find((e) => e.round_number === roundParam && e.status !== 'cancelled');
      if (!target) {
        return interaction.reply({ content: `No event found for round ${roundParam}.`, ephemeral: true });
      }
    } else {
      // Default: first non-cancelled event that hasn't had a draw yet
      target = events.find(
        (e) =>
          e.status !== 'cancelled' &&
          (e.random_bonus_position == null || Number(e.random_bonus_position) < 4)
      );
      if (!target) {
        return interaction.reply({
          content: '🎲 All events already have a random position drawn.',
          ephemeral: true,
        });
      }
    }

    const result = drawEventRandomBonusPosition({ seasonId, eventId: target.id });
    const name = cleanEventName(target.name);
    const typeLabel = eventTypeLabel(target.type);

    if (!result.ok && result.status === 409) {
      // Already drawn — surface it clearly
      const drawnAt = result.randomBonusDrawnAt
        ? new Date(Number(result.randomBonusDrawnAt)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : null;
      return interaction.reply(
        `🎲 **P${result.randomBonusPosition}** was already drawn for the **${name} ${typeLabel}**${drawnAt ? ` on ${drawnAt}` : ''}. No re-draws allowed!`
      );
    }

    if (!result.ok) {
      return interaction.reply({ content: `Could not draw: ${result.error}`, ephemeral: true });
    }

    return interaction.reply(
      `🎲 Drew **P${result.randomBonusPosition}** for the **${name} ${typeLabel}**!\nWhoever finishes P${result.randomBonusPosition} earns the random position bonus.`
    );
  }

  async function handleStandings(interaction) {
    const seasonId = getActiveSeasonId();
    const standings = getStandings(seasonId);

    if (!standings.length) {
      return interaction.reply('No standings data yet — the auction may not have started.');
    }

    const lines = ['**Pool Standings**', '```'];
    standings.forEach((s, i) => {
      const net = fmtNet(s.total_earned_cents, s.total_spent_cents);
      const earned = dollars(s.total_earned_cents);
      const spent = dollars(s.total_spent_cents);
      lines.push(`${String(i + 1).padStart(2)}. ${s.name.padEnd(14)} ${net.padStart(7)}  (earned ${earned}, spent ${spent})`);
    });
    lines.push('```');

    return interaction.reply(truncate(lines.join('\n')));
  }

  async function handleSchedule(interaction) {
    const seasonId = getActiveSeasonId();
    const events = getEvents(seasonId);

    if (!events.length) {
      return interaction.reply('No events scheduled yet.');
    }

    const STATUS_ICON = {
      scored: '✅',
      results_loaded: '⏳',
      pending: '📅',
      cancelled: '❌',
    };

    const lines = ['**2026 F1 Schedule**', '```'];
    for (const e of events) {
      const icon = STATUS_ICON[e.status] || '📅';
      const name = cleanEventName(e.name);
      const type = e.type === 'sprint' ? ' (Sprint)' : '';
      const dateStr = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '      ';
      lines.push(`${icon} R${String(e.round_number).padEnd(2)} ${dateStr.padEnd(7)} ${name}${type}`);
    }
    lines.push('```');

    return interaction.reply(truncate(lines.join('\n')));
  }

  async function handlePayouts(interaction) {
    const seasonId = getActiveSeasonId();
    const roundParam = interaction.options.getInteger('round');
    const events = getEvents(seasonId);

    let target;
    if (roundParam != null) {
      target = events.find((e) => e.round_number === roundParam);
      if (!target) {
        return interaction.reply({ content: `No event found for round ${roundParam}.`, ephemeral: true });
      }
      if (target.status !== 'scored') {
        return interaction.reply({ content: `Round ${roundParam} hasn't been scored yet.`, ephemeral: true });
      }
    } else {
      // Default: most recently scored event
      const scored = events.filter((e) => e.status === 'scored');
      target = scored[scored.length - 1];
      if (!target) {
        return interaction.reply('No scored events yet.');
      }
    }

    const payouts = getEventPayouts(seasonId, target.id);
    const name = cleanEventName(target.name);
    const typeLabel = eventTypeLabel(target.type);

    const lines = [`**${name} ${typeLabel} — Payouts**`, ''];

    if (!payouts.length) {
      lines.push('No payouts were distributed for this event.');
    } else {
      for (const row of payouts) {
        const emoji = CATEGORY_EMOJI[row.category] || '•';
        const label = CATEGORY_LABEL[row.category] || row.category;
        const driver = row.driver_code || row.driver_name || '?';
        const tie = row.tie_count > 1 ? ' _(split)_' : '';
        lines.push(`${emoji} **${label}** — ${driver} → ${row.participant_name} — ${dollars(row.amount_cents)}${tie}`);
      }
    }

    return interaction.reply(truncate(lines.join('\n')));
  }

  async function handleAsk(interaction) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return interaction.reply({ content: 'AI queries are not configured (missing ANTHROPIC_API_KEY).', ephemeral: true });
    }

    await interaction.deferReply();

    const question = interaction.options.getString('question');
    try {
      const answer = await runAiQuery(question);
      await interaction.editReply(truncate(answer || 'No response generated.'));
    } catch (err) {
      console.error('[discord] /ask error:', err);
      await interaction.editReply('Something went wrong with the AI query. Please try again.');
    }
  }

  // ── AI agent ────────────────────────────────────────────────────────────────

  async function runAiQuery(question) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const seasonId = getActiveSeasonId();

    const tools = [
      {
        name: 'get_standings',
        description: 'Get current season pool standings with earnings, spend, and net position per participant.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_schedule',
        description: 'Get the full 2026 F1 race schedule including event names, round numbers, dates, and scoring status.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_payout_rules',
        description: 'Get the scoring/payout rules for Grand Prix events, Sprint events, and end-of-season bonus categories. Shows what each category pays and how it is determined.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_event_payouts',
        description: 'Get the payout breakdown for a specific scored race or sprint. Use round_number to identify the event.',
        input_schema: {
          type: 'object',
          properties: {
            round_number: {
              type: 'number',
              description: 'The round number of the event to look up.',
            },
          },
          required: ['round_number'],
        },
      },
    ];

    const systemPrompt = `You are a friendly assistant for an F1 Calcutta auction pool on Discord.

A Calcutta is a fantasy auction where participants bid real money to "buy" F1 drivers before the season. When a driver earns payouts by finishing in certain positions, their owner earns that money.

Payout categories include: Race Winner, 2nd/3rd Place, Best P6+, Best P11+, Most Positions Gained, Slowest Pit Stop, and a Random Position Bonus (a random finishing position drawn before the race — whoever owns that driver earns the bonus). Sprint races have their own lighter category set. Season-end bonuses cover the Drivers Champion, Most Race Wins, and other cumulative stats.

Each participant has a budget cap and must allocate it across multiple drivers at auction. Net position = total earned minus total spent.

Be concise and friendly. Format responses for Discord using **bold** for emphasis. Avoid tables — use simple lists instead. Keep responses under 1800 characters.`;

    const messages = [{ role: 'user', content: question }];
    let response;

    // Agentic tool-use loop
    do {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
      });

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          let result;

          try {
            if (block.name === 'get_standings') {
              const standings = getStandings(seasonId);
              result = standings.map((s) => ({
                rank: standings.indexOf(s) + 1,
                name: s.name,
                drivers_owned: s.drivers_owned,
                earned: dollars(s.total_earned_cents),
                spent: dollars(s.total_spent_cents),
                net: fmtNet(s.total_earned_cents, s.total_spent_cents),
              }));
            } else if (block.name === 'get_schedule') {
              const events = getEvents(seasonId);
              result = events.map((e) => ({
                round: e.round_number,
                name: cleanEventName(e.name),
                type: eventTypeLabel(e.type),
                date: e.starts_at
                  ? new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : null,
                status: e.status,
                random_bonus_position: e.random_bonus_position || null,
              }));
            } else if (block.name === 'get_payout_rules') {
              const gpRules = getEventPayoutRules(seasonId, 'grand_prix');
              const sprintRules = getEventPayoutRules(seasonId, 'sprint');
              const bonusRules = getSeasonBonusRules(seasonId);
              result = {
                grand_prix: gpRules.map((r) => ({
                  category: CATEGORY_LABEL[r.category] || r.category,
                  label: r.label,
                  bps: r.base_bps,
                })),
                sprint: sprintRules.map((r) => ({
                  category: CATEGORY_LABEL[r.category] || r.category,
                  label: r.label,
                  bps: r.base_bps,
                })),
                season_bonus: bonusRules.map((r) => ({
                  category: CATEGORY_LABEL[r.category] || r.category,
                  label: r.label,
                  bps: r.base_bps,
                })),
                note: 'bps = basis points of total pot. 100 bps = 1%. Actual dollar amounts depend on total pot size.',
              };
            } else if (block.name === 'get_event_payouts') {
              const events = getEvents(seasonId);
              const event = events.find((e) => e.round_number === block.input.round_number);
              if (!event) {
                result = { error: `No event found for round ${block.input.round_number}` };
              } else if (event.status !== 'scored') {
                result = { error: `Round ${block.input.round_number} (${cleanEventName(event.name)}) has not been scored yet (status: ${event.status}).` };
              } else {
                const payouts = getEventPayouts(seasonId, event.id);
                result = {
                  event: cleanEventName(event.name),
                  type: eventTypeLabel(event.type),
                  random_bonus_position: event.random_bonus_position || null,
                  payouts: payouts.map((p) => ({
                    category: CATEGORY_LABEL[p.category] || p.category,
                    driver: p.driver_code || p.driver_name,
                    participant: p.participant_name,
                    amount: dollars(p.amount_cents),
                    split: p.tie_count > 1 ? true : undefined,
                  })),
                };
              }
            }
          } catch (err) {
            result = { error: err.message };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: 'user', content: toolResults });
      }
    } while (response.stop_reason === 'tool_use');

    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  // ── Post-race notification ──────────────────────────────────────────────────

  async function notifyEventScored(seasonId, eventId) {
    if (!channelId) return;

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error('[discord] Could not fetch channel:', err.message);
      return;
    }
    if (!channel) return;

    const event = getEventById(seasonId, eventId);
    if (!event) return;

    const payouts = getEventPayouts(seasonId, eventId);
    const standings = getStandings(seasonId);
    const name = cleanEventName(event.name);
    const typeLabel = eventTypeLabel(event.type);

    const lines = [];
    lines.push(`🏁 **${name} ${typeLabel}** — Round ${event.round_number} Results`);
    lines.push('');

    if (!payouts.length) {
      lines.push('No payouts were distributed for this event.');
    } else {
      lines.push('**Payouts**');
      for (const row of payouts) {
        const emoji = CATEGORY_EMOJI[row.category] || '•';
        const label = CATEGORY_LABEL[row.category] || row.category;
        // Append drawn position to random bonus label
        const displayLabel =
          row.category === 'random_finish_bonus' && event.random_bonus_position
            ? `${label} (P${event.random_bonus_position})`
            : label;
        const driver = row.driver_code || row.driver_name || '?';
        const tie = row.tie_count > 1 ? ' _(split)_' : '';
        lines.push(`${emoji} ${displayLabel} — ${driver} → **${row.participant_name}** — ${dollars(row.amount_cents)}${tie}`);
      }
    }

    lines.push('');
    lines.push('**Standings**');
    standings.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.name}** — ${fmtNet(s.total_earned_cents, s.total_spent_cents)}`);
    });

    await channel.send(truncate(lines.join('\n')));
  }

  // ── Command registration ────────────────────────────────────────────────────

  async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(token);
    const body = buildCommandDefinitions();

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
      console.log(`[discord] Slash commands registered to guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(appId), { body });
      console.log('[discord] Slash commands registered globally (may take up to 1 hour to propagate)');
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async function start() {
    try {
      await registerCommands();
    } catch (err) {
      console.error('[discord] Failed to register commands:', err.message);
    }

    client.once('ready', () => {
      console.log(`[discord] Bot logged in as ${client.user.tag}`);
      if (!channelId) {
        console.log('[discord] DISCORD_CHANNEL_ID not set — post-race notifications disabled');
      }
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const handlers = {
        draw: handleDraw,
        standings: handleStandings,
        schedule: handleSchedule,
        payouts: handlePayouts,
        ask: handleAsk,
      };

      const handler = handlers[interaction.commandName];
      if (!handler) return;

      try {
        await handler(interaction);
      } catch (err) {
        console.error(`[discord] Error in /${interaction.commandName}:`, err);
        const msg = 'Something went wrong. Please try again.';
        try {
          if (interaction.deferred) {
            await interaction.editReply({ content: msg });
          } else if (!interaction.replied) {
            await interaction.reply({ content: msg, ephemeral: true });
          }
        } catch (_) {
          // ignore reply errors
        }
      }
    });

    // Subscribe to internal event bus for post-race notifications
    eventBus.on('event:scored', ({ seasonId, eventId }) => {
      notifyEventScored(seasonId, eventId).catch((err) =>
        console.error('[discord] Notification error:', err.message)
      );
    });

    await client.login(token);
  }

  function stop() {
    client.destroy();
  }

  return { start, stop };
}

module.exports = { createDiscordService };
