'use strict';

/**
 * userChoiceStorage.js
 *
 * Lightweight storage foundation for recording user transit choices.
 * Provides the data shape and persistence layer needed for future
 * preference adaptation — no machine learning required.
 *
 * Shape of a stored choice event:
 * {
 *   date:                string   — ISO date of the selection (YYYY-MM-DD)
 *   chosenTransitKey:    string   — canonical key, e.g. "moon_conjunction_mars"
 *   chosenAspect:        string   — e.g. "conjunction"
 *   chosenPlanets:       string[] — e.g. ["Moon", "Mars"]
 *   activeSignals:       string[] — signals active at the time of selection
 *   rejectedTransitKeys: string[] — available transits that were not chosen
 * }
 *
 * Usage:
 *   const { buildChoiceEvent, recordChoice } = require('./userChoiceStorage');
 *   const event = buildChoiceEvent(chosenTransit, { activeSignals, rejectedTransits });
 *   recordChoice(event);
 */

const STORAGE_KEY = 'astrobrain_user_choices';

// In-memory fallback for Node.js / non-browser contexts.
let _memoryStore = [];

/**
 * Builds a normalised choice event object ready for storage.
 *
 * @param {object}   chosenTransit             - The transit the user selected
 * @param {object}   [opts={}]
 * @param {string[]} [opts.activeSignals=[]]   - Signals active at selection time
 * @param {object[]} [opts.rejectedTransits=[]]- Other transits that were available
 * @param {string}   [opts.date]               - ISO date; defaults to today
 * @returns {object} Normalised choice event
 */
function buildChoiceEvent(chosenTransit, opts = {}) {
  const { activeSignals = [], rejectedTransits = [], date } = opts;
  const today = new Date().toISOString().slice(0, 10);

  const chosenKey = [
    (chosenTransit.planet || '').toLowerCase(),
    (chosenTransit.aspect || '').toLowerCase(),
    (chosenTransit.target || '').toLowerCase(),
  ].join('_');

  const rejectedKeys = rejectedTransits
    .map((t) => [
      (t.planet || '').toLowerCase(),
      (t.aspect || '').toLowerCase(),
      (t.target || '').toLowerCase(),
    ].join('_'))
    .filter((k) => k !== chosenKey);

  return {
    date:                date || today,
    chosenTransitKey:    chosenKey,
    chosenAspect:        chosenTransit.aspect  || '',
    chosenPlanets:       [chosenTransit.planet, chosenTransit.target].filter(Boolean),
    activeSignals:       [...activeSignals],
    rejectedTransitKeys: rejectedKeys,
  };
}

/**
 * Persists a choice event.
 *
 * Stores in localStorage when available (browser); falls back to in-memory
 * storage in Node.js / server contexts.
 *
 * @param {object} choiceEvent - Built with buildChoiceEvent()
 * @returns {object} The stored event (for confirmation / chaining)
 */
function recordChoice(choiceEvent) {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      existing.push(choiceEvent);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } else {
      _memoryStore.push(choiceEvent);
    }
  } catch (_) {
    // Storage unavailable — silently continue
  }
  return choiceEvent;
}

/**
 * Retrieves all stored choice events.
 *
 * @returns {object[]}
 */
function getChoiceHistory() {
  try {
    if (typeof localStorage !== 'undefined') {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    return [..._memoryStore];
  } catch (_) {
    return [];
  }
}

/**
 * Clears all stored choice events.
 */
function clearChoiceHistory() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      _memoryStore = [];
    }
  } catch (_) {
    // ignore
  }
}

module.exports = {
  buildChoiceEvent,
  recordChoice,
  getChoiceHistory,
  clearChoiceHistory,
  STORAGE_KEY,
};
