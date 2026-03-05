const FALLBACK_TEAM_META = {
  teamName: 'Formula 1',
  aliases: [],
  primaryColor: '#7f8a99',
  secondaryColor: '#1a2230',
  textColor: '#d7dde7',
  logoUrl: '',
  driverCodes: [],
  isFallback: true,
};

export const TEAM_META = {
  'Red Bull': {
    teamName: 'Red Bull',
    aliases: ['Oracle Red Bull Racing', 'Red Bull Racing'],
    primaryColor: '#1e5bc6',
    secondaryColor: '#061638',
    textColor: '#78a8ff',
    logoUrl: '/team-logos/red-bull.svg',
    logoUrls: ['/team-logos/red-bull.svg'],
    driverCodes: ['VER', 'PER'],
  },
  Ferrari: {
    teamName: 'Ferrari',
    aliases: ['Scuderia Ferrari', 'Scuderia Ferrari HP'],
    primaryColor: '#e80020',
    secondaryColor: '#23070b',
    textColor: '#ff9ea7',
    logoUrl: '/team-logos/ferrari.svg',
    logoUrls: ['/team-logos/ferrari.svg'],
    driverCodes: ['LEC', 'HAM'],
  },
  McLaren: {
    teamName: 'McLaren',
    aliases: ['McLaren F1 Team'],
    primaryColor: '#ff8000',
    secondaryColor: '#2b1200',
    textColor: '#ffc185',
    logoUrl: '/team-logos/mclaren.svg',
    logoUrls: ['/team-logos/mclaren.svg'],
    driverCodes: ['NOR', 'PIA'],
  },
  Mercedes: {
    teamName: 'Mercedes',
    aliases: ['Mercedes AMG Petronas', 'Mercedes-AMG Petronas'],
    primaryColor: '#00d2be',
    secondaryColor: '#032522',
    textColor: '#8dfff2',
    logoUrl: '/team-logos/mercedes.svg',
    logoUrls: ['/team-logos/mercedes.svg'],
    driverCodes: ['RUS', 'ANT'],
  },
  'Aston Martin': {
    teamName: 'Aston Martin',
    aliases: ['Aston Martin Aramco', 'Aston Martin Aramco F1 Team'],
    primaryColor: '#229971',
    secondaryColor: '#052018',
    textColor: '#8de8c9',
    logoUrl: '/team-logos/aston-martin.svg',
    logoUrls: ['/team-logos/aston-martin.svg'],
    driverCodes: ['ALO', 'STR'],
  },
  Alpine: {
    teamName: 'Alpine',
    aliases: ['BWT Alpine F1 Team'],
    primaryColor: '#0090ff',
    secondaryColor: '#051f39',
    textColor: '#8cc9ff',
    logoUrl: '/team-logos/alpine.svg',
    logoUrls: ['/team-logos/alpine.svg'],
    driverCodes: ['GAS', 'DOO'],
  },
  Williams: {
    teamName: 'Williams',
    aliases: ['Williams Racing'],
    primaryColor: '#37bedd',
    secondaryColor: '#0b2230',
    textColor: '#9ce8ff',
    logoUrl: '/team-logos/williams.svg',
    logoUrls: ['/team-logos/williams.svg'],
    driverCodes: ['ALB', 'SAI'],
  },
  'Kick Sauber': {
    teamName: 'Kick Sauber',
    aliases: ['Stake F1 Team Kick Sauber', 'Sauber'],
    primaryColor: '#52e252',
    secondaryColor: '#0b250b',
    textColor: '#b9ffb9',
    logoUrl: '/team-logos/kick-sauber.svg',
    logoUrls: ['/team-logos/kick-sauber.svg'],
    driverCodes: ['HUL', 'BOR'],
  },
  RB: {
    teamName: 'RB',
    aliases: ['Visa Cash App RB', 'Racing Bulls', 'RB F1 Team'],
    primaryColor: '#6d87ff',
    secondaryColor: '#121a42',
    textColor: '#becbff',
    logoUrl: '/team-logos/rb.svg',
    logoUrls: ['/team-logos/rb.svg'],
    driverCodes: ['TSU', 'LAW'],
  },
  Haas: {
    teamName: 'Haas',
    aliases: ['MoneyGram Haas F1 Team'],
    primaryColor: '#c8c8c8',
    secondaryColor: '#202020',
    textColor: '#f2f2f2',
    logoUrl: '/team-logos/haas.svg',
    logoUrls: ['/team-logos/haas.svg'],
    driverCodes: ['OCO', 'BEA'],
  },
};

function canonicalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const TEAM_LOOKUP = new Map();
const DRIVER_LOOKUP = new Map();

Object.values(TEAM_META).forEach((meta) => {
  TEAM_LOOKUP.set(canonicalize(meta.teamName), meta);
  (meta.aliases || []).forEach((alias) => TEAM_LOOKUP.set(canonicalize(alias), meta));
  (meta.driverCodes || []).forEach((code) => DRIVER_LOOKUP.set(String(code).toUpperCase(), meta));
});

export function normalizeTeamName(name) {
  return canonicalize(name);
}

export function resolveTeamMeta({ teamName, driverCode } = {}) {
  const byTeam = TEAM_LOOKUP.get(canonicalize(teamName));
  if (byTeam) return byTeam;

  const byDriver = DRIVER_LOOKUP.get(String(driverCode || '').toUpperCase());
  if (byDriver) return byDriver;

  return FALLBACK_TEAM_META;
}

export function getTeamColorStyle(input, options = {}) {
  const meta = resolveTeamMeta(input);
  if (meta.isFallback) return {};
  if (options.forBorder) return { borderColor: `${meta.primaryColor}66` };
  return { color: meta.textColor };
}

export function getFallbackTeamMeta() {
  return FALLBACK_TEAM_META;
}
