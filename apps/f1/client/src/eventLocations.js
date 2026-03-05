import { normalizeEventName } from './utils';

const EVENT_LOCATION_MAP = {
  [normalizeEventName('Australian Grand Prix')]: 'Melbourne, Australia',
  [normalizeEventName('Chinese Grand Prix')]: 'Shanghai, China',
  [normalizeEventName('Japanese Grand Prix')]: 'Suzuka, Japan',
  [normalizeEventName('Bahrain Grand Prix')]: 'Sakhir, Bahrain',
  [normalizeEventName('Saudi Arabian Grand Prix')]: 'Jeddah, Saudi Arabia',
  [normalizeEventName('Miami Grand Prix')]: 'Miami, United States',
  [normalizeEventName('Emilia Romagna Grand Prix')]: 'Imola, Italy',
  [normalizeEventName('Monaco Grand Prix')]: 'Monte Carlo, Monaco',
  [normalizeEventName('Spanish Grand Prix')]: 'Barcelona, Spain',
  [normalizeEventName('Canadian Grand Prix')]: 'Montreal, Canada',
  [normalizeEventName('Austrian Grand Prix')]: 'Spielberg, Austria',
  [normalizeEventName('British Grand Prix')]: 'Silverstone, United Kingdom',
  [normalizeEventName('Belgian Grand Prix')]: 'Spa-Francorchamps, Belgium',
  [normalizeEventName('Hungarian Grand Prix')]: 'Budapest, Hungary',
  [normalizeEventName('Dutch Grand Prix')]: 'Zandvoort, Netherlands',
  [normalizeEventName('Italian Grand Prix')]: 'Monza, Italy',
  [normalizeEventName('Azerbaijan Grand Prix')]: 'Baku, Azerbaijan',
  [normalizeEventName('Singapore Grand Prix')]: 'Singapore',
  [normalizeEventName('United States Grand Prix')]: 'Austin, United States',
  [normalizeEventName('Mexico City Grand Prix')]: 'Mexico City, Mexico',
  [normalizeEventName('Sao Paulo Grand Prix')]: 'Sao Paulo, Brazil',
  [normalizeEventName('Las Vegas Grand Prix')]: 'Las Vegas, United States',
  [normalizeEventName('Qatar Grand Prix')]: 'Lusail, Qatar',
  [normalizeEventName('Abu Dhabi Grand Prix')]: 'Abu Dhabi, United Arab Emirates',
};

export function getEventLocation(name) {
  return EVENT_LOCATION_MAP[normalizeEventName(name)] || 'Location TBD';
}

