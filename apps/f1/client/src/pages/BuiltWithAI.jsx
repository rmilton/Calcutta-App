import React from 'react';
import { Link } from 'react-router-dom';
import {
  BUILT_WITH_AI_FLOW,
  BUILT_WITH_AI_OUTCOMES,
  BUILT_WITH_AI_PRACTICE,
  BUILT_WITH_AI_TIMELINE,
  BUILT_WITH_AI_TOOLS,
  BUILT_WITH_AI_WHY,
} from '../content/builtWithAIContent';

export default function BuiltWithAI() {
  return (
    <div className="built-page fade-in stack-lg">
      <section className="built-hero">
        <div className="built-hero-copy">
          <Link className="built-back-link" to="/join">← Back to landing page</Link>
          <h1>Built With AI</h1>
          <p className="built-hero-subhead">
            This F1 Calcutta was planned, built, deployed, and operated through an agentic engineering workflow using
            OpenAI Codex, Anthropic Claude Code, GitHub, Railway, Azure DevOps, and OpenF1.
          </p>
          <div className="built-tool-strip" aria-label="Tools used">
            {BUILT_WITH_AI_TOOLS.map((tool) => (
              <div key={tool.label} className="built-tool-item">
                <div className="built-tool-logo-wrap">
                  <img className="built-tool-logo" src={tool.logoUrl} alt={`${tool.label} logo`} loading="lazy" />
                </div>
                <div className="built-tool-copy">
                  <strong>{tool.label}</strong>
                  <span>{tool.sublabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="built-hero-art" aria-hidden="true">
          <div className="built-hero-arc built-hero-arc-a" />
          <div className="built-hero-arc built-hero-arc-b" />
          <div className="built-hero-arc built-hero-arc-c" />
          <div className="built-hero-signal">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="built-outcomes">
        {BUILT_WITH_AI_OUTCOMES.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </section>

      <section className="built-section">
        <div className="built-section-head">
          <div className="hero-kicker">Delivery Story</div>
          <h2>From prompt to production</h2>
          <p>
            The value was not just code generation. The workflow combined planning, implementation, backlog control,
            deployment, and live data integration into one operating loop.
          </p>
        </div>
        <div className="built-timeline" aria-label="Delivery timeline">
          {BUILT_WITH_AI_TIMELINE.map((item) => (
            <article key={item.step} className="built-timeline-item">
              <div className="built-timeline-step">{item.step}</div>
              <div className="built-timeline-content">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="built-section">
        <div className="built-section-head">
          <div className="hero-kicker">Workflow</div>
          <h2>How the system moved work forward</h2>
          <p>
            This is the operating flow behind the product: human direction, agent execution, standard engineering
            controls, cloud delivery, backlog management, and live race data.
          </p>
        </div>
        <div className="built-flow" role="img" aria-label="Ryan Milton to AI agents to GitHub to Railway to Azure DevOps to OpenF1 flow">
          {BUILT_WITH_AI_FLOW.map((item, index) => (
            <article key={item.label} className="built-flow-step">
              <div className="built-flow-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
              <h3>{item.label}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="built-section built-practice-grid">
        <div className="built-section-head">
          <div className="hero-kicker">In Practice</div>
          <h2>What actually made this work</h2>
        </div>
        <div className="built-practice-list">
          {BUILT_WITH_AI_PRACTICE.map((item) => (
            <article key={item.title} className="built-practice-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="built-section built-why">
        <div className="built-section-head">
          <div className="hero-kicker">Where It Leads</div>
          <h2>Where agentic engineering is going</h2>
        </div>
        <div className="built-why-list">
          {BUILT_WITH_AI_WHY.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>

      <section className="built-footer">
        <p>Questions? <a href="mailto:ryan@ryanmilton.com">Contact Ryan</a></p>
        <div className="built-footer-links">
          <Link to="/guide">F1 Calcutta Guide</Link>
          <Link to="/join">Join Page</Link>
        </div>
      </section>

      <footer className="page-copyright">
        © 2026 Ryan Milton.
      </footer>
    </div>
  );
}
