import { EventEmitter } from 'node:events';
import { db, now } from './db.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export type Stage = 'queued' | 'product' | 'brand' | 'competitors' | 'learnings' | 'designs' | 'checks' | 'done' | 'error' | 'awaiting_brand';

export function log(runId: string, stage: Stage, message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const created_at = now();
  db.prepare('INSERT INTO run_events (run_id, stage, message, level, created_at) VALUES (?,?,?,?,?)').run(runId, stage, message, level, created_at);
  db.prepare('UPDATE runs SET stage = ?, updated_at = ? WHERE id = ?').run(stage, created_at, runId);
  bus.emit(`run:${runId}`, { type: 'log', stage, message, level, created_at });
  if (level !== 'info') console.warn(`[${runId}] ${stage}: ${message}`);
}

export function emitUpdate(runId: string, payload: Record<string, unknown> = {}) {
  bus.emit(`run:${runId}`, { type: 'update', ...payload });
}
