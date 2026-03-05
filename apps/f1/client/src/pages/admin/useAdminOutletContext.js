import { useOutletContext } from 'react-router-dom';

/**
 * @typedef {Object} AdminOutletContext
 * @property {Object|null} settings
 * @property {Array<Object>} participants
 * @property {Array<Object>} events
 * @property {Object|null} rules
 * @property {string} message
 * @property {boolean} loading
 * @property {boolean} hasLoaded
 * @property {() => Promise<void>} refresh
 * @property {(field: string, value: unknown) => void} setField
 * @property {(value: string) => void} setMessage
 * @property {() => Promise<void>} saveSettings
 * @property {(endpoint: string) => Promise<void>} runAuctionAction
 * @property {(options?: {force?: boolean}) => Promise<void>} syncNext
 * @property {(eventId: number, options?: {force?: boolean}) => Promise<void>} syncEvent
 * @property {() => Promise<void>} recalcSeasonBonuses
 * @property {(group: string, id: number, field: string, value: unknown) => void} updateRules
 * @property {() => Promise<void>} saveRules
 */

/**
 * @returns {AdminOutletContext}
 */
export default function useAdminOutletContext() {
  return useOutletContext();
}
