import 'dotenv/config';
import axios from 'axios';

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  
  const longer = normA.length > normB.length ? normA : normB;
  const shorter = normA.length > normB.length ? normB : normA;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };
  
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

async function main() {
  const apiKey = 'GvpziueL9ouzIJNj';
  
  console.log('📥 获取 iSports 赛程数据...');
  const response = await axios.get('http://api.isportsapi.com/sport/football/schedule/basic', {
    params: { api_key: apiKey, date: '2025-11-02' }
  });
  
  const matches = response.data.data || [];
  console.log(`   获取到 ${matches.length} 场比赛`);
  console.log('');
  
  // 测试用例（来自皇冠未匹配的赛事）
  const testCases = [
    { home: 'Oita Trinita', away: 'Montedio Yamagata', league: 'Japan J2 League' },
    { home: 'Bayswater City', away: 'Sydney United 58', league: 'Australia Championship' },
    { home: 'NWS Spirit', away: 'Preston Lions', league: 'Australia Championship' },
  ];
  
  for (const crown of testCases) {
    console.log(`🔍 测试: ${crown.home} vs ${crown.away}`);
    console.log(`   联赛: ${crown.league}`);
    
    let best: any = null;
    
    for (const isMatch of matches) {
      const homeScore = similarity(crown.home, isMatch.homeName);
      const awayScore = similarity(crown.away, isMatch.awayName);
      const leagueScore = similarity(crown.league, isMatch.leagueName);
      
      const combined = leagueScore * 0.15 + homeScore * 0.35 + awayScore * 0.35 + 0.15; // 假设时间分数为1
      
      if (!best || combined > best.score) {
        best = {
          match: isMatch,
          score: combined,
          homeScore,
          awayScore,
          leagueScore
        };
      }
    }
    
    if (best) {
      console.log(`   最佳匹配: ${best.match.homeName} vs ${best.match.awayName}`);
      console.log(`   联赛: ${best.match.leagueName}`);
      console.log(`   主队相似度: ${best.homeScore.toFixed(4)}`);
      console.log(`   客队相似度: ${best.awayScore.toFixed(4)}`);
      console.log(`   联赛相似度: ${best.leagueScore.toFixed(4)}`);
      console.log(`   综合分数: ${best.score.toFixed(4)}`);
      console.log(`   是否匹配 (>= 0.55): ${best.score >= 0.55 ? '✅ 是' : '❌ 否'}`);
    }
    console.log('');
  }
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});

