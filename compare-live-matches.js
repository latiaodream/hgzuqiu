const fs = require('fs');

// 读取 iSportsAPI 数据
const iSportsData = require('./fetcher-isports/data/latest-matches.json');
const iSportsLive = iSportsData.matches.filter(m => m.state === 1);

// 读取 Odds-API.io 数据（从数据库导出）
const oddsApiLiveRaw = `Hong Kong FC,Eastern SC,"Hong Kong, China - Premier League",2025-11-09 16:30:00+08,0-4
1. FC Slovacko B,MFK Vitkovice,Czechia - MSFL,2025-11-09 17:15:00+08,1-0
Slovan Bratislava B,MSK Puchov,Slovakia - 2. Liga,2025-11-09 17:30:00+08,0-0
Sparta Prague B,FC Zbrojovka Brno,Czechia - FNL,2025-11-09 17:30:00+08,0-3
MSK Zilina B,FC STK 1914 Samorin,Slovakia - 2. Liga,2025-11-09 17:30:00+08,0-0
FC Gifu,Gainare Tottori,Japan - J3 League,2025-11-09 18:00:00+08,0-0
K. Khanh Hoa,CS. Dong Thap,Vietnam - V-League 2,2025-11-09 18:00:00+08,0-0
Slavia Tu Kosice,MFk Dukla Banska Bystrica,Slovakia - 2. Liga,2025-11-09 18:00:00+08,0-0
Fatih Karagumruk Istanbul,Konyaspor,Turkiye - Super Lig,2025-11-09 19:30:00+08,2-0
Holstein Kiel,Fortuna Dusseldorf,Germany - 2. Bundesliga,2025-11-09 20:30:00+08,1-0
RSC Anderlecht,Club Brugge,Belgium - Pro League,2025-11-09 20:30:00+08,1-0
1. FC Magdeburg,SC Paderborn 07,Germany - 2. Bundesliga,2025-11-09 20:30:00+08,0-1
Eintracht Braunschweig,VfL Bochum,Germany - 2. Bundesliga,2025-11-09 20:30:00+08,0-2
VfB Stuttgart II,Alemannia Aachen,Germany - 3. Liga,2025-11-09 20:30:00+08,1-2
FC Unirea 2004 Slobozia,FC CFR 1907 Cluj,Romania - Superliga,2025-11-09 20:30:00+08,0-1
Ceramica Cleopatra,Pyramids FC,Egypt - Supercup,2025-11-09 20:45:00+08,0-0
AE Kifisia FC,Olympiacos Piraeus,Greece - Super League,2025-11-09 21:00:00+08,1-1
Torpedo Moscow,FC Sokol Saratov,Russia - 1. Liga,2025-11-09 21:00:00+08,0-0
FC Fredericia,Viborg FF,Denmark - Superliga,2025-11-09 21:00:00+08,0-2
Athletic Bilbao,Real Oviedo,Spain - LaLiga,2025-11-09 21:00:00+08,1-0
FC Basel 1893,FC Lugano,Switzerland - Super League,2025-11-09 21:00:00+08,0-0
Pendikspor,Umraniyespor,Turkiye - 1. Lig,2025-11-09 21:00:00+08,1-0
SK Rotor Volgograd,FC Shinnik Yaroslavl,Russia - 1. Liga,2025-11-09 21:00:00+08,1-0
Aris Thessaloniki,Asteras Tripolis,Greece - Super League,2025-11-09 21:00:00+08,0-0
Vejle BK,FC Copenhagen,Denmark - Superliga,2025-11-09 21:00:00+08,0-0
FC CSKA 1948,PFC Cherno More Varna,Bulgaria - Parva Liga,2025-11-09 21:00:00+08,0-1
UD Las Palmas,Racing Santander,Spain - LaLiga 2,2025-11-09 21:00:00+08,3-1
FC Vaduz,Stade Lausanne Ouchy,Switzerland - Challenge League,2025-11-09 21:00:00+08,2-1
NEC Nijmegen,FC Groningen,Netherlands - Eredivisie,2025-11-09 21:30:00+08,0-0
Rosenborg BK,Vaalerenga IF,Norway - Eliteserien,2025-11-09 21:30:00+08,0-0
LASK Linz,SCR Altach,Austria - Bundesliga,2025-11-09 21:30:00+08,1-0
Korona Kielce,RKS Rakow Czestochowa,Poland - Ekstraklasa,2025-11-09 21:45:00+08,1-2
Legia Warszawa,Bruk-Bet Termalica Nieciecza,Poland - Ekstraklasa,2025-11-09 21:45:00+08,0-1
Rayo Vallecano B,CD Quintanar del Rey,Spain - Segunda Federacion,2025-11-09 21:45:00+08,2-0
Nottingham Forest,Leeds United,England - Premier League,2025-11-09 22:00:00+08,0-1
Lazio Rome,SSD Napoli,"Italy - Serie A, Women",2025-11-09 22:00:00+08,0-0
Hammarby IF,IF Elfsborg,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
FC Lorient,Toulouse FC,France - Ligue 1,2025-11-09 22:00:00+08,0-0
FC Stockholm Internazionale,Assyriska FF,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,0-0
Crystal Palace,Brighton & Hove Albion,England - Premier League,2025-11-09 22:00:00+08,0-0
Malmo FF,GAIS,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
Sollentuna FK,Karlbergs BK,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,1-0
IFK Goteborg,IFK Norrkoping FK,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
IF Karlstad Fotbol,Hammarby Talang FF,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,0-0
IFK Stocksund,Vasalunds IF,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,0-1
Nordic United FC,FC Arlanda,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,0-0
Brentford FC,Newcastle United,England - Premier League,2025-11-09 22:00:00+08,0-0
Gefle IF,Orebro Syrianska IF,"Sweden - Ettan, Norra",2025-11-09 22:00:00+08,0-0
Genoa CFC,ACF Fiorentina,Italy - Serie A,2025-11-09 22:00:00+08,1-0
Bologna FC,SSC Napoli,Italy - Serie A,2025-11-09 22:00:00+08,0-0
FC Felgueiras 1932,Academico de Viseu FC,Portugal - Liga Portugal 2,2025-11-09 22:00:00+08,0-1
Cesena FC,US Avellino,Italy - Serie B,2025-11-09 22:00:00+08,0-0
Kocaelispor,Galatasaray Istanbul,Turkiye - Super Lig,2025-11-09 22:00:00+08,0-0
AIK,Halmstads BK,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
IF Brommapojkarna,Degerfors IF,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
Osters IF,Djurgardens IF,Sweden - Allsvenskan,2025-11-09 22:00:00+08,0-0
IK Sirius,IFK Varnamo,Sweden - Allsvenskan,2025-11-09 22:00:00+08,1-0
Kazincbarcikai SC,Ferencvarosi Budapest,Hungary - NB I,2025-11-09 22:15:00+08,0-0`;

// 解析 Odds-API 数据（去重）
const oddsApiLive = [];
const seen = new Set();
oddsApiLiveRaw.split('\n').forEach(line => {
  const [home, away, league, time, score] = line.split(',').map(s => s.replace(/^"|"$/g, ''));
  const key = `${home}|${away}`;
  if (!seen.has(key)) {
    seen.add(key);
    oddsApiLive.push({ home, away, league, time, score });
  }
});

console.log('📊 滚球赛事对比分析');
console.log('='.repeat(80));
console.log('');
console.log(`iSportsAPI 滚球: ${iSportsLive.length} 场`);
console.log(`Odds-API.io 滚球: ${oddsApiLive.length} 场`);
console.log('');

// 标准化球队名称（用于模糊匹配）
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/fc|sc|cf|ac|afc|bk|if|fk|sk|kf|rsc|vfb|vfl|1\.|ii|b$/gi, '')
    .replace(/\./g, '')
    .trim();
}

// 查找匹配的比赛
const matched = [];
const oddsApiOnly = [];
const iSportsOnly = [];

oddsApiLive.forEach(odds => {
  const oddsHomeNorm = normalize(odds.home);
  const oddsAwayNorm = normalize(odds.away);
  
  const found = iSportsLive.find(isp => {
    const ispHomeNorm = normalize(isp.home_en || isp.home);
    const ispAwayNorm = normalize(isp.away_en || isp.away);
    
    return (oddsHomeNorm.includes(ispHomeNorm) || ispHomeNorm.includes(oddsHomeNorm)) &&
           (oddsAwayNorm.includes(ispAwayNorm) || ispAwayNorm.includes(oddsAwayNorm));
  });
  
  if (found) {
    matched.push({
      odds: odds,
      iSports: found
    });
  } else {
    oddsApiOnly.push(odds);
  }
});

iSportsLive.forEach(isp => {
  const ispHomeNorm = normalize(isp.home_en || isp.home);
  const ispAwayNorm = normalize(isp.away_en || isp.away);
  
  const found = oddsApiLive.find(odds => {
    const oddsHomeNorm = normalize(odds.home);
    const oddsAwayNorm = normalize(odds.away);
    
    return (oddsHomeNorm.includes(ispHomeNorm) || ispHomeNorm.includes(oddsHomeNorm)) &&
           (oddsAwayNorm.includes(ispAwayNorm) || ispAwayNorm.includes(oddsAwayNorm));
  });
  
  if (!found) {
    iSportsOnly.push(isp);
  }
});

console.log('━'.repeat(80));
console.log('匹配结果:');
console.log('━'.repeat(80));
console.log(`✅ 两家都有: ${matched.length} 场`);
console.log(`🔵 仅 Odds-API.io 有: ${oddsApiOnly.length} 场`);
console.log(`🟢 仅 iSportsAPI 有: ${iSportsOnly.length} 场`);
console.log('');

console.log('━'.repeat(80));
console.log('✅ 两家都有的比赛:');
console.log('━'.repeat(80));
matched.forEach((m, i) => {
  console.log(`${i + 1}. ${m.odds.home} vs ${m.odds.away}`);
  console.log(`   Odds-API: ${m.odds.league} (${m.odds.score})`);
  console.log(`   iSports:  ${m.iSports.league_en || m.iSports.league} (${m.iSports.home_score || 0}-${m.iSports.away_score || 0})`);
  console.log('');
});

console.log('━'.repeat(80));
console.log('🔵 仅 Odds-API.io 有的比赛:');
console.log('━'.repeat(80));
oddsApiOnly.forEach((m, i) => {
  console.log(`${i + 1}. ${m.home} vs ${m.away}`);
  console.log(`   联赛: ${m.league}`);
  console.log(`   比分: ${m.score}`);
  console.log('');
});

console.log('━'.repeat(80));
console.log('🟢 仅 iSportsAPI 有的比赛:');
console.log('━'.repeat(80));
iSportsOnly.forEach((m, i) => {
  console.log(`${i + 1}. ${m.home_en || m.home} vs ${m.away_en || m.away}`);
  console.log(`   联赛: ${m.league_en || m.league}`);
  console.log(`   比分: ${m.home_score || 0}-${m.away_score || 0}`);
  console.log('');
});

// 保存结果
const result = {
  summary: {
    oddsApiTotal: oddsApiLive.length,
    iSportsTotal: iSportsLive.length,
    matched: matched.length,
    oddsApiOnly: oddsApiOnly.length,
    iSportsOnly: iSportsOnly.length
  },
  matched: matched,
  oddsApiOnly: oddsApiOnly,
  iSportsOnly: iSportsOnly
};

fs.writeFileSync('./live-matches-comparison.json', JSON.stringify(result, null, 2));
console.log('━'.repeat(80));
console.log('✅ 结果已保存到 live-matches-comparison.json');

