import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * 测试 fetch-crown-gids.ts 脚本
 * 验证是否能正确从 fetcher-isports 读取数据
 */

async function main() {
  console.log('🧪 测试 fetch-crown-gids 脚本\n');

  // 1. 检查 fetcher-isports 数据文件
  const possiblePaths = [
    path.resolve(process.cwd(), '../fetcher-isports/data/latest-matches.json'),
    path.resolve(process.cwd(), 'fetcher-isports/data/latest-matches.json'),
    path.resolve('/www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json'),
  ];

  console.log('📂 检查 fetcher-isports 数据文件...');
  let foundPath: string | null = null;
  let fetcherData: any = null;

  for (const filePath of possiblePaths) {
    console.log(`   检查: ${filePath}`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        fetcherData = JSON.parse(fileContent);
        foundPath = filePath;
        console.log(`   ✅ 找到数据文件`);
        break;
      } catch (error: any) {
        console.log(`   ❌ 读取失败: ${error.message}`);
      }
    } else {
      console.log(`   ⚠️  文件不存在`);
    }
  }

  if (!foundPath || !fetcherData) {
    console.error('\n❌ 测试失败: 无法找到 fetcher-isports 数据文件');
    console.error('   请确保 fetcher-isports 服务正在运行');
    console.error('   运行命令: pm2 status crown-fetcher-isports');
    process.exit(1);
  }

  // 2. 检查数据格式
  console.log('\n📊 检查数据格式...');
  const matches = fetcherData.matches || [];
  const timestamp = fetcherData.timestamp || 0;
  const age = Date.now() - timestamp;

  console.log(`   - 数据文件: ${foundPath}`);
  console.log(`   - 数据时间: ${new Date(timestamp).toLocaleString('zh-CN')}`);
  console.log(`   - 数据年龄: ${Math.floor(age / 1000)} 秒`);
  console.log(`   - 赛事总数: ${matches.length}`);

  if (matches.length === 0) {
    console.warn('\n⚠️  警告: 赛事数量为 0');
    console.warn('   这可能是正常的（没有比赛），也可能是数据问题');
  }

  if (age > 600000) {
    console.warn(`\n⚠️  警告: 数据已过期 (${Math.floor(age / 60000)} 分钟前)`);
    console.warn('   建议检查 fetcher-isports 服务是否正常运行');
  }

  // 3. 检查赛事数据结构
  console.log('\n🔍 检查赛事数据结构...');
  let validCount = 0;
  let invalidCount = 0;
  let liveCount = 0;
  let todayCount = 0;
  let earlyCount = 0;

  for (const match of matches) {
    const crownGid = match.crown_gid || match.gid;
    if (!crownGid) {
      invalidCount++;
      continue;
    }

    validCount++;

    // 统计赛事类型
    if (match.state === 1 || match.state === '1' || match.period || match.clock) {
      liveCount++;
    } else {
      const matchTime = new Date(match.timer || match.time || match.match_time);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (matchTime >= today && matchTime < tomorrow) {
        todayCount++;
      } else {
        earlyCount++;
      }
    }
  }

  console.log(`   - 有效赛事: ${validCount}`);
  console.log(`   - 无效赛事: ${invalidCount}`);
  console.log(`   - 滚球: ${liveCount}`);
  console.log(`   - 今日: ${todayCount}`);
  console.log(`   - 早盘: ${earlyCount}`);

  // 4. 显示示例赛事
  if (validCount > 0) {
    console.log('\n📋 示例赛事 (前3场):');
    let count = 0;
    for (const match of matches) {
      const crownGid = match.crown_gid || match.gid;
      if (!crownGid || count >= 3) break;

      console.log(`\n   赛事 ${count + 1}:`);
      console.log(`   - GID: ${crownGid}`);
      console.log(`   - 联赛: ${match.league || match.crown_league || 'N/A'}`);
      console.log(`   - 主队: ${match.team_h || match.home || match.crown_home || 'N/A'}`);
      console.log(`   - 客队: ${match.team_c || match.away || match.crown_away || 'N/A'}`);
      console.log(`   - 时间: ${match.timer || match.time || match.match_time || 'N/A'}`);
      count++;
    }
  }

  // 5. 测试运行 fetch-crown-gids 脚本
  console.log('\n🚀 测试运行 fetch-crown-gids 脚本...');
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  try {
    const { stdout, stderr } = await execPromise('npm run crown:fetch-gids', {
      cwd: path.resolve(process.cwd()),
      timeout: 30000,
    });

    console.log('\n📝 脚本输出:');
    console.log(stdout);

    if (stderr) {
      console.log('\n⚠️  错误输出:');
      console.log(stderr);
    }

    // 检查输出文件
    const outputFile = path.resolve(process.cwd(), 'crown-gids.json');
    if (fs.existsSync(outputFile)) {
      const outputData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      console.log('\n✅ 输出文件生成成功:');
      console.log(`   - 文件: ${outputFile}`);
      console.log(`   - 赛事数: ${outputData.matchCount || outputData.matches?.length || 0}`);
      console.log(`   - 数据源: ${outputData.source || 'unknown'}`);
    } else {
      console.error('\n❌ 输出文件未生成');
      process.exit(1);
    }

    console.log('\n✅ 测试通过！');
    console.log('\n💡 提示:');
    console.log('   - 脚本已成功从 fetcher-isports 读取数据');
    console.log('   - 不再使用皇冠API，避免账号被封');
    console.log('   - 定时任务会自动运行此脚本');

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stdout) {
      console.log('\n📝 标准输出:');
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.log('\n⚠️  错误输出:');
      console.log(error.stderr);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});

