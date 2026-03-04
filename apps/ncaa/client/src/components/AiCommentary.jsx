import React, { useState, useEffect, useCallback } from 'react';
import { useSocketEvent } from '../context/SocketContext';

// How long (ms) the notification stays visible after streaming finishes
const AUTO_DISMISS_MS = 10000;

const CONFIG = {
  recap: { icon: '📊', label: 'Round Recap' },
};

export default function AiCommentary() {
  // note: { type: 'recap', text: string, done: boolean } | null
  const [note, setNote] = useState(null);
  // Progress bar width (0→100) for the auto-dismiss timer
  const [progress, setProgress] = useState(100);

  // --- socket handlers ---
  const onRecapChunk = useCallback(({ token }) => {
    setNote((prev) =>
      !prev || prev.done
        ? { type: 'recap', text: token, done: false }
        : { ...prev, text: prev.text + token }
    );
  }, []);

  const onRecapDone = useCallback(() => {
    setNote((prev) => (prev ? { ...prev, done: true } : null));
  }, []);

  useSocketEvent('bracket:recap:chunk', onRecapChunk);
  useSocketEvent('bracket:recap:done', onRecapDone);

  // --- auto-dismiss with animated countdown bar ---
  useEffect(() => {
    if (!note?.done) return;

    setProgress(100);
    const startMs = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
      if (pct === 0) clearInterval(tick);
    }, 50);

    const dismiss = setTimeout(() => setNote(null), AUTO_DISMISS_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(dismiss);
    };
  }, [note?.done]);

  if (!note) return null;

  const { icon, label } = CONFIG[note.type] ?? CONFIG.recap;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-50 pointer-events-none">
      <div className="pointer-events-auto card-elevated border-brand/20 ring-1 ring-brand/10 shadow-2xl overflow-hidden">
        {/* Content */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'rgba(249,115,22,0.12)' }}
          >
            <span aria-hidden="true" className="text-sm leading-none">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {label}
            </div>
            <p className="text-text-primary text-sm leading-relaxed">
              {note.text}
              {!note.done && (
                <span className="inline-block w-0.5 h-3.5 bg-text-muted ml-0.5 align-middle motion-safe:animate-pulse" />
              )}
            </p>
          </div>
          <button
            onClick={() => setNote(null)}
            className="touch-target text-text-secondary hover:text-text-primary text-xl leading-none shrink-0 mt-0.5 transition-colors"
            aria-label="Dismiss commentary"
          >
            ×
          </button>
        </div>

        {/* Countdown progress bar — only visible after streaming completes */}
        {note.done && (
          <div className="h-0.5 bg-surface-input">
            <div
              className="h-full transition-none"
              style={{ width: `${progress}%`, background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
