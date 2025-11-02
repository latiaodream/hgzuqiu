import { pinyin } from 'pinyin-pro';

// 常见球队别名映射
const TEAM_ALIASES: Record<string, string[]> = {
  // 英文球队
  'manchester united': ['man united', 'man utd', 'mufc'],
  'manchester city': ['man city', 'mcfc'],
  'tottenham': ['tottenham hotspur', 'spurs'],
  'newcastle': ['newcastle united'],
  'west ham': ['west ham united'],
  'brighton': ['brighton hove albion'],
  'nottingham forest': ['nott forest', 'notts forest'],
  'psv': ['psv eindhoven'],
  'hertha bsc': ['hertha berlin'],
  'bayern': ['bayern munich', 'fc bayern'],
  'borussia dortmund': ['bvb', 'dortmund'],
  'inter': ['inter milan', 'internazionale'],
  'ac milan': ['milan'],
  'atletico madrid': ['atletico', 'atm'],
  'athletic bilbao': ['athletic club'],
  'real sociedad': ['sociedad'],
  'paris saint germain': ['psg', 'paris sg'],
  'olympique marseille': ['marseille', 'om'],
  'olympique lyon': ['lyon', 'ol'],

  // 中文球队（繁体 → 拼音/英文）
  '青島海牛': ['qingdao hainiu', 'qingdao'],
  '武漢三鎮': ['wuhan three towns', 'wuhan'],
  '水原': ['suwon'],
  '大邱': ['daegu'],
  '忠南牙山': ['chungnam asan'],
  '天安城': ['cheonan city'],
  '北區': ['northern district'],
  '南區足球會': ['southern district'],
};

// 需要移除的无效词
const REMOVE_WORDS = [
  'fc', 'cf', 'sc', 'ac', 'as', 'cd', 'rcd', 'ud', 'sd',
  'u23', 'u21', 'u19', 'u18',
  'football club', 'soccer club', 'sporting club',
  'club', 'united', 'city', 'town', 'athletic',
  'reserves', 'ii', 'iii', 'b', 'c',
];

function normalizeTeamName(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(normalized);
  if (hasChinese) {
    // 转换为拼音（不带音调）
    normalized = pinyin(normalized, { toneType: 'none', type: 'array' }).join('');
  }
  
  // 移除无效词
  for (const word of REMOVE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, ' ');
  }
  
  // 只保留字母和数字
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

function getTeamVariants(name: string): string[] {
  const normalized = normalizeTeamName(name);
  const variants = [normalized];
  
  // 检查别名映射
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const canonicalNorm = normalizeTeamName(canonical);
    if (normalized === canonicalNorm) {
      variants.push(...aliases.map(a => normalizeTeamName(a)));
    }
    for (const alias of aliases) {
      const aliasNorm = normalizeTeamName(alias);
      if (normalized === aliasNorm) {
        variants.push(canonicalNorm);
        variants.push(...aliases.filter(a => a !== alias).map(a => normalizeTeamName(a)));
      }
    }
  }
  
  return [...new Set(variants)];
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.match(/.{1,3}/g) || []);
  const tokensB = new Set(b.match(/.{1,3}/g) || []);
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - matrix[b.length][a.length] / maxLen;
}

function calculateSimilarity(name1: string, name2: string): number {
  const variants1 = getTeamVariants(name1);
  const variants2 = getTeamVariants(name2);
  
  let maxScore = 0;
  
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (!v1 || !v2) continue;
      
      // 完全匹配
      if (v1 === v2) return 1.0;
      
      // 包含匹配
      if (v1.includes(v2) || v2.includes(v1)) {
        const shorter = v1.length < v2.length ? v1 : v2;
        const longer = v1.length < v2.length ? v2 : v1;
        const containScore = 0.85 + (shorter.length / longer.length) * 0.15;
        maxScore = Math.max(maxScore, containScore);
      }
      
      // Jaccard 相似度
      const jaccardScore = jaccardSimilarity(v1, v2);
      maxScore = Math.max(maxScore, jaccardScore);
      
      // Levenshtein 相似度
      const levenScore = levenshteinSimilarity(v1, v2);
      maxScore = Math.max(maxScore, levenScore);
    }
  }
  
  return maxScore;
}

// 测试用例
const testCases = [
  // 英文球队
  ['Porto', 'FC Porto'],
  ['Braga', 'Sporting Braga'],
  ['AVS', 'AVS Futebol SAD'],
  ['Manisa', 'Manisa BB Spor'],
  ['Amed', 'Amedspor'],
  ['Manchester United', 'Man Utd'],
  ['PSV', 'PSV Eindhoven'],
  ['Hertha Berlin', 'Hertha BSC'],
  
  // 中文球队
  ['青島海牛', 'Qingdao Hainiu'],
  ['武漢三鎮', 'Wuhan Three Towns'],
  ['水原', 'Suwon FC'],
  ['大邱', 'Daegu FC'],
];

console.log('🧪 测试匹配算法:\n');

for (const [name1, name2] of testCases) {
  const score = calculateSimilarity(name1, name2);
  const status = score >= 0.48 ? '✅' : '❌';
  console.log(`${status} ${name1} vs ${name2}: ${score.toFixed(3)}`);
  
  // 显示标准化后的名称
  const norm1 = normalizeTeamName(name1);
  const norm2 = normalizeTeamName(name2);
  console.log(`   标准化: "${norm1}" vs "${norm2}"`);
  console.log('');
}

console.log('\n📊 统计:');
const passed = testCases.filter(([n1, n2]) => calculateSimilarity(n1, n2) >= 0.48).length;
console.log(`通过: ${passed}/${testCases.length} (${(passed / testCases.length * 100).toFixed(1)}%)`);

