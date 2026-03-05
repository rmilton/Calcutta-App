import React from 'react';
import { Link } from 'react-router-dom';
import { GUIDE_EVENT_PAYOUTS, GUIDE_FAQ, GUIDE_SECTION_LINKS } from '../content/guideContent';

const bpsToPercent = (bps) => `${(Number(bps || 0) / 100).toFixed(2)}%`;

function PayoutTable({ title, totalBps, totalPercent, rows }) {
  return (
    <section className="panel guide-table-panel">
      <div className="guide-table-head">
        <h3>{title}</h3>
        <div className="guide-table-total">
          <span>{totalBps} bps</span>
          <strong>{totalPercent}</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>BPS</th>
              <th>% of Pot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.category}`}>
                <td>{row.category}</td>
                <td>{row.bps}</td>
                <td>{bpsToPercent(row.bps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Guide() {
  return (
    <div className="guide-page fade-in stack-lg">
      <section className="panel panel-hero guide-hero">
        <div className="guide-hero-main">
          <div className="hero-kicker">Before You Join</div>
          <h1>How F1 Calcutta Works</h1>
          <p className="muted">
            This guide explains what a Calcutta is, how the F1 auction runs, and exactly how race and season payouts are earned.
          </p>
          <div className="row wrap gap-sm">
            <Link className="btn" to="/join">Join Pool</Link>
            <Link className="btn btn-outline" to="/join">Admin Login</Link>
          </div>
          <p className="muted small">Admin login uses the Admin tab on the join screen.</p>
        </div>
        <nav className="guide-section-nav" aria-label="Guide sections">
          {GUIDE_SECTION_LINKS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="guide-section-link">
              {section.label}
            </a>
          ))}
        </nav>
      </section>

      <section id="what-is-calcutta" className="panel stack guide-section">
        <h2>What Is a Calcutta?</h2>
        <p>
          A Calcutta is an auction-style pool. Instead of drafting teams, you bid real dollars on drivers.
          Your winnings come from performance categories paid out of the shared auction purse.
        </p>
        <p className="muted">
          In short: buy drivers you believe are undervalued, then earn payouts when they hit category outcomes.
        </p>
      </section>

      <section id="auction-format" className="panel stack guide-section">
        <h2>Auction Format in This App</h2>
        <ul className="list guide-list">
          <li>Drivers are auctioned live, one at a time.</li>
          <li>Bids increase the current price until the bid clock expires.</li>
          <li>Clock and grace-extension settings are controlled by the admin.</li>
          <li>The final highest bidder owns that driver for the season.</li>
          <li>When all drivers are sold, rosters lock and race payouts begin.</li>
        </ul>
      </section>

      <section id="payout-model" className="stack guide-section">
        <h2>Event Payout Model</h2>
        <p className="muted guide-disclaimer">
          Event payouts are percentages of the total auction pot. Random position bonuses use a non-podium draw (P4+).
        </p>
        <div className="guide-table-grid">
          <PayoutTable {...GUIDE_EVENT_PAYOUTS.grandPrix} />
          <PayoutTable {...GUIDE_EVENT_PAYOUTS.sprint} />
        </div>
        <section className="panel guide-note">
          <h3>Tie Splits</h3>
          <p>
            If multiple drivers tie for a category, the category pot is split evenly among winners.
            Split math handles cents fairly so total distributed amount stays accurate.
          </p>
        </section>
      </section>

      <section id="season-bonus" className="stack guide-section">
        <h2>Season Bonus Model</h2>
        <PayoutTable {...GUIDE_EVENT_PAYOUTS.seasonBonus} />
      </section>

      <section className="panel stack guide-section">
        <h2>End-to-End Example</h2>
        <p className="muted">
          Example: if the pool pot is <strong>$600</strong>, a 50 bps category pays <strong>$3.00</strong> (0.50% of pot).
          If your driver wins that category, that payout is credited to your totals.
        </p>
      </section>

      <section id="faq" className="panel stack guide-section">
        <h2>FAQ</h2>
        <div className="guide-faq">
          {GUIDE_FAQ.map((item) => (
            <article key={item.question} className="guide-faq-item">
              <h3>{item.question}</h3>
              <p className="muted">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel panel-hero guide-footer-cta">
        <h2>Ready to join?</h2>
        <p className="muted">Live pool settings and race sync timing are controlled by the admin.</p>
        <div className="row wrap gap-sm">
          <Link className="btn" to="/join">Join Pool</Link>
          <Link className="btn btn-outline" to="/join">Go to Login</Link>
        </div>
      </section>
    </div>
  );
}
