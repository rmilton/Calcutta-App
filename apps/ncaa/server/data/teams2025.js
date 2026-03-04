// 2025 NCAA Tournament bracket - 64 teams
// espn_id: ESPN's numeric team ID — used to build logo URLs
//   https://a.espncdn.com/i/teamlogos/ncaa/500/{espn_id}.png
// color: team primary brand color, used as badge fallback when logo unavailable
const TEAMS_2025 = [
  // EAST REGION
  { seed: 1,  region: 'East',    name: 'Duke',             espn_id: 150,  color: '#003087' },
  { seed: 2,  region: 'East',    name: 'Alabama',          espn_id: 333,  color: '#9E1B32' },
  { seed: 3,  region: 'East',    name: 'Wisconsin',        espn_id: 275,  color: '#C5050C' },
  { seed: 4,  region: 'East',    name: 'Arizona',          espn_id: 12,   color: '#003366' },
  { seed: 5,  region: 'East',    name: 'Oregon',           espn_id: 2483, color: '#154733' },
  { seed: 6,  region: 'East',    name: 'BYU',              espn_id: 252,  color: '#002E5D' },
  { seed: 7,  region: 'East',    name: "Saint Mary's",     espn_id: 2608, color: '#002469' },
  { seed: 8,  region: 'East',    name: 'Mississippi State',espn_id: 344,  color: '#5D1725' },
  { seed: 9,  region: 'East',    name: 'Baylor',           espn_id: 239,  color: '#154734' },
  { seed: 10, region: 'East',    name: 'Vanderbilt',       espn_id: 238,  color: '#00205B' },
  { seed: 11, region: 'East',    name: 'VCU',              espn_id: 2670, color: '#FFB300' },
  { seed: 12, region: 'East',    name: 'Liberty',          espn_id: 2335, color: '#002868' },
  { seed: 13, region: 'East',    name: 'Akron',            espn_id: 2006, color: '#00285E' },
  { seed: 14, region: 'East',    name: 'Vermont',          espn_id: 261,  color: '#154734' },
  { seed: 15, region: 'East',    name: 'Robert Morris',    espn_id: 2523, color: '#14234B' },
  { seed: 16, region: 'East',    name: 'American',         espn_id: 44,   color: '#C41E3A' },

  // WEST REGION
  { seed: 1,  region: 'West',    name: 'Kansas',           espn_id: 2305, color: '#0051A5' },
  { seed: 2,  region: 'West',    name: "St. John's",       espn_id: 2569, color: '#CC0000' },
  { seed: 3,  region: 'West',    name: 'Kentucky',         espn_id: 96,   color: '#0033A0' },
  { seed: 4,  region: 'West',    name: 'Maryland',         espn_id: 120,  color: '#E03A3E' },
  { seed: 5,  region: 'West',    name: 'Memphis',          espn_id: 235,  color: '#003087' },
  { seed: 6,  region: 'West',    name: 'Clemson',          espn_id: 228,  color: '#F66733' },
  { seed: 7,  region: 'West',    name: 'UCLA',             espn_id: 26,   color: '#2D68C4' },
  { seed: 8,  region: 'West',    name: 'Gonzaga',          espn_id: 2250, color: '#002469' },
  { seed: 9,  region: 'West',    name: 'Georgia',          espn_id: 61,   color: '#BA0C2F' },
  { seed: 10, region: 'West',    name: 'Utah State',       espn_id: 328,  color: '#00263A' },
  { seed: 11, region: 'West',    name: 'Drake',            espn_id: 2181, color: '#004B87' },
  { seed: 12, region: 'West',    name: 'Colorado State',   espn_id: 36,   color: '#1E4D2B' },
  { seed: 13, region: 'West',    name: 'Grand Canyon',     espn_id: 2253, color: '#522398' },
  { seed: 14, region: 'West',    name: 'Montana',          espn_id: 149,  color: '#73000A' },
  { seed: 15, region: 'West',    name: 'Wofford',          espn_id: 2747, color: '#866C00' },
  { seed: 16, region: 'West',    name: 'Norfolk State',    espn_id: 2450, color: '#006633' },

  // SOUTH REGION
  { seed: 1,  region: 'South',   name: 'Auburn',           espn_id: 2,    color: '#E87722' },
  { seed: 2,  region: 'South',   name: 'Michigan State',   espn_id: 127,  color: '#18453B' },
  { seed: 3,  region: 'South',   name: 'Iowa State',       espn_id: 66,   color: '#C8102E' },
  { seed: 4,  region: 'South',   name: 'Texas A&M',        espn_id: 245,  color: '#500000' },
  { seed: 5,  region: 'South',   name: 'Michigan',         espn_id: 130,  color: '#00274C' },
  { seed: 6,  region: 'South',   name: 'Mississippi',      espn_id: 145,  color: '#CE1126' },
  { seed: 7,  region: 'South',   name: 'Marquette',        espn_id: 269,  color: '#003087' },
  { seed: 8,  region: 'South',   name: 'Louisville',       espn_id: 97,   color: '#AD0000' },
  { seed: 9,  region: 'South',   name: 'Creighton',        espn_id: 156,  color: '#005CA9' },
  { seed: 10, region: 'South',   name: 'New Mexico',       espn_id: 167,  color: '#BA0C2F' },
  { seed: 11, region: 'South',   name: 'San Diego State',  espn_id: 21,   color: '#C41230' },
  { seed: 12, region: 'South',   name: 'UC San Diego',     espn_id: 2604, color: '#00629B' },
  { seed: 13, region: 'South',   name: 'Yale',             espn_id: 43,   color: '#00356B' },
  { seed: 14, region: 'South',   name: 'Lipscomb',         espn_id: 2352, color: '#461D7C' },
  { seed: 15, region: 'South',   name: 'Bryant',           espn_id: 2803, color: '#231F20' },
  { seed: 16, region: 'South',   name: 'SIU Edwardsville', espn_id: 2565, color: '#C8102E' },

  // MIDWEST REGION
  { seed: 1,  region: 'Midwest', name: 'Florida',          espn_id: 57,   color: '#0021A5' },
  { seed: 2,  region: 'Midwest', name: 'Tennessee',        espn_id: 2633, color: '#FF8200' },
  { seed: 3,  region: 'Midwest', name: 'Texas Tech',       espn_id: 2641, color: '#CC0000' },
  { seed: 4,  region: 'Midwest', name: 'Purdue',           espn_id: 2509, color: '#CFB991' },
  { seed: 5,  region: 'Midwest', name: 'Connecticut',      espn_id: 41,   color: '#0E1A3B' },
  { seed: 6,  region: 'Midwest', name: 'Illinois',         espn_id: 356,  color: '#E84A27' },
  { seed: 7,  region: 'Midwest', name: 'Missouri',         espn_id: 142,  color: '#F1B82D' },
  { seed: 8,  region: 'Midwest', name: 'UConn',            espn_id: 41,   color: '#0E1A3B' },
  { seed: 9,  region: 'Midwest', name: 'Oklahoma',         espn_id: 201,  color: '#841617' },
  { seed: 10, region: 'Midwest', name: 'Arkansas',         espn_id: 8,    color: '#9D2235' },
  { seed: 11, region: 'Midwest', name: 'TCU',              espn_id: 2628, color: '#4D1979' },
  { seed: 12, region: 'Midwest', name: 'McNeese',          espn_id: 2377, color: '#005F86' },
  { seed: 13, region: 'Midwest', name: 'High Point',       espn_id: 2272, color: '#4B2069' },
  { seed: 14, region: 'Midwest', name: 'Troy',             espn_id: 2653, color: '#8B0000' },
  { seed: 15, region: 'Midwest', name: 'Omaha',            espn_id: 2437, color: '#C8102E' },
  { seed: 16, region: 'Midwest', name: 'SFA',              espn_id: 2636, color: '#4C1C2D' },
];

module.exports = { TEAMS_2025 };
