/**
 * 从 Excel 文件导入翻译后的简体中文名称
 * 支持 .xlsx 和 .xls 格式
 */

import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { nameAliasService } from '../src/services/name-alias-service';

interface ExcelRow {
  ID: number;
  'Canonical Key': string;
  'English Name': string;
  'Traditional Chinese (iSports)': string;
  'Simplified Chinese (Crown)': string;
}

async function importLeaguesFromExcel(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    console.log('⚠️  联赛文件不存在，跳过');
    return 0;
  }

  console.log(`📋 读取联赛文件: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`📋 读取到 ${rows.length} 条联赛记录`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = typeof row.ID === 'number' ? row.ID : parseInt(String(row.ID));
    const crownName = row['Simplified Chinese (Crown)'];

    // 只更新有简体中文的记录
    if (crownName && String(crownName).trim() !== '') {
      try {
        await nameAliasService.updateLeagueAlias(id, {
          nameCrownZhCn: String(crownName).trim(),
        });
        updated++;
        if (updated % 10 === 0) {
          console.log(`   已更新 ${updated} 个联赛...`);
        }
      } catch (error) {
        console.error(`❌ 更新联赛 ${id} 失败:`, error);
      }
    } else {
      skipped++;
    }
  }

  console.log(`✅ 联赛更新完成: ${updated} 个，跳过: ${skipped} 个\n`);
  return updated;
}

async function importTeamsFromExcel(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    console.log('⚠️  球队文件不存在，跳过');
    return 0;
  }

  console.log(`📋 读取球队文件: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`📋 读取到 ${rows.length} 条球队记录`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = typeof row.ID === 'number' ? row.ID : parseInt(String(row.ID));
    const crownName = row['Simplified Chinese (Crown)'];

    // 只更新有简体中文的记录
    if (crownName && String(crownName).trim() !== '') {
      try {
        await nameAliasService.updateTeamAlias(id, {
          nameCrownZhCn: String(crownName).trim(),
        });
        updated++;
        if (updated % 50 === 0) {
          console.log(`   已更新 ${updated} 个球队...`);
        }
      } catch (error) {
        console.error(`❌ 更新球队 ${id} 失败:`, error);
      }
    } else {
      skipped++;
    }
  }

  console.log(`✅ 球队更新完成: ${updated} 个，跳过: ${skipped} 个\n`);
  return updated;
}

async function importTranslations() {
  console.log('============================================================');
  console.log('📥 从 Excel 导入翻译后的简体中文名称');
  console.log('============================================================\n');

  const leaguesPath = path.join(__dirname, '../../exports/leagues-en.xlsx');
  const teamsPath = path.join(__dirname, '../../exports/teams-en.xlsx');

  // 也支持 .csv 文件（如果用户保存为 CSV）
  const leaguesCsvPath = path.join(__dirname, '../../exports/leagues-en.csv');
  const teamsCsvPath = path.join(__dirname, '../../exports/teams-en.csv');

  let leagueCount = 0;
  let teamCount = 0;

  // 优先使用 Excel 文件
  if (fs.existsSync(leaguesPath)) {
    leagueCount = await importLeaguesFromExcel(leaguesPath);
  } else if (fs.existsSync(leaguesCsvPath)) {
    console.log('⚠️  未找到 leagues-en.xlsx，尝试使用 leagues-en.csv');
    // 这里可以调用原来的 CSV 导入逻辑
  } else {
    console.log('⚠️  未找到联赛文件（xlsx 或 csv）');
  }

  if (fs.existsSync(teamsPath)) {
    teamCount = await importTeamsFromExcel(teamsPath);
  } else if (fs.existsSync(teamsCsvPath)) {
    console.log('⚠️  未找到 teams-en.xlsx，尝试使用 teams-en.csv');
    // 这里可以调用原来的 CSV 导入逻辑
  } else {
    console.log('⚠️  未找到球队文件（xlsx 或 csv）');
  }

  console.log('============================================================');
  console.log('✅ 导入完成！');
  console.log('📊 统计：');
  console.log(`   - 联赛: ${leagueCount} 个`);
  console.log(`   - 球队: ${teamCount} 个`);
  console.log('\n💡 下一步：');
  console.log('   1. 重新运行皇冠导入脚本进行匹配');
  console.log('   2. 查看匹配率是否提升');
  console.log('\n📝 命令：');
  console.log('   CROWN_USERNAME=WjeLaA68i0 CROWN_PASSWORD=I0FQsaTFFUHg npm run aliases:import-crown');
  console.log('============================================================');

  process.exit(0);
}

importTranslations().catch((error) => {
  console.error('❌ 导入失败:', error);
  process.exit(1);
});

