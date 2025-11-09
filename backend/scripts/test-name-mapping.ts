#!/usr/bin/env ts-node
/**
 * 测试名称映射逻辑
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

/**
 * 根据 iSports 名称查找映射的简体中文名称
 */
async function findMappedName(
  type: 'league' | 'team',
  isportsName: string
): Promise<{ mapped: boolean; name: string }> {
  try {
    const tableName = type === 'league' ? 'league_aliases' : 'team_aliases';

    console.log(`\n🔍 查找 ${type}: "${isportsName}"`);

    // 1. 尝试精确匹配 name_zh_tw (iSports 使用繁体中文)
    let result = await pool.query(
      `SELECT name_zh_cn, name_zh_tw, name_en FROM ${tableName} WHERE name_zh_tw = $1 LIMIT 1`,
      [isportsName]
    );

    console.log(`   步骤1 - 匹配 name_zh_tw: ${result.rows.length > 0 ? '✅ 找到' : '❌ 未找到'}`);
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`   数据: name_zh_cn="${row.name_zh_cn}", name_zh_tw="${row.name_zh_tw}", name_en="${row.name_en}"`);
      // 优先返回简体中文，如果没有则返回繁体中文，最后才是英文
      const displayName = row.name_zh_cn || row.name_zh_tw || row.name_en || isportsName;
      console.log(`   ✅ 返回: "${displayName}"`);
      return { mapped: true, name: displayName };
    }

    // 2. 尝试精确匹配 name_en (iSports 也可能返回英文)
    result = await pool.query(
      `SELECT name_zh_cn, name_zh_tw, name_en FROM ${tableName} WHERE name_en = $1 LIMIT 1`,
      [isportsName]
    );

    console.log(`   步骤2 - 匹配 name_en: ${result.rows.length > 0 ? '✅ 找到' : '❌ 未找到'}`);
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`   数据: name_zh_cn="${row.name_zh_cn}", name_zh_tw="${row.name_zh_tw}", name_en="${row.name_en}"`);
      // 优先返回简体中文，如果没有则返回繁体中文，最后才是英文
      const displayName = row.name_zh_cn || row.name_zh_tw || row.name_en || isportsName;
      console.log(`   ✅ 返回: "${displayName}"`);
      return { mapped: true, name: displayName };
    }

    // 3. 未找到映射，返回原名
    console.log(`   ❌ 未找到映射，返回原名: "${isportsName}"`);
    return { mapped: false, name: isportsName };
  } catch (error) {
    console.error(`   ❌ 查找映射失败 (${type}):`, error);
    return { mapped: false, name: isportsName };
  }
}

async function main() {
  console.log('================================================================================');
  console.log('🧪 测试名称映射逻辑');
  console.log('================================================================================');

  try {
    // 测试用例
    const testCases = [
      { type: 'team' as const, name: 'Stellenbosch FC' },
      { type: 'team' as const, name: 'Stellenbosch FC Reserves' },
      { type: 'team' as const, name: '斯泰倫博斯' },
      { type: 'league' as const, name: 'Premier League' },
      { type: 'league' as const, name: 'English Premier League' },
    ];

    for (const testCase of testCases) {
      const result = await findMappedName(testCase.type, testCase.name);
      console.log(`\n📊 结果: ${result.mapped ? '✅ 已映射' : '❌ 未映射'} - "${result.name}"`);
    }

    console.log('\n================================================================================');
    console.log('✅ 测试完成');
    console.log('================================================================================\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

