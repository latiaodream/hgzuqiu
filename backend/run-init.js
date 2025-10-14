/**
 * 初始化皇冠账号脚本
 * 用法: node backend/run-init.js <账号ID> <新用户名> <新密码>
 * 示例: node backend/run-init.js 19 User2024ab Pass2024XY
 */

require('dotenv').config({ path: './.env' });
const { query } = require('./dist/models/database');
const { getCrownAutomation } = require('./dist/services/crown-automation');

const accountId = parseInt(process.argv[2], 10);
const newUsername = process.argv[3];
const newPassword = process.argv[4];

// 参数验证
if (!accountId || !newUsername || !newPassword) {
  console.error('❌ 参数不足');
  console.log('用法: node backend/run-init.js <账号ID> <新用户名> <新密码>');
  console.log('示例: node backend/run-init.js 19 User2024ab Pass2024XY');
  console.log('');
  console.log('注意事项:');
  console.log('1. 新用户名要求: 6-12位，至少2个字母+1个数字');
  console.log('2. 新密码要求: 6-12位，至少2个字母+1个数字');
  console.log('3. 新密码必须与当前密码不同');
  process.exit(1);
}

// 验证新用户名格式
if (!/^[A-Za-z0-9]{6,12}$/.test(newUsername)) {
  console.error('❌ 新用户名格式不正确');
  console.log('要求: 6-12位字母和数字组合');
  process.exit(1);
}

const letterCount = (newUsername.match(/[A-Za-z]/g) || []).length;
const digitCount = (newUsername.match(/[0-9]/g) || []).length;

if (letterCount < 2 || digitCount < 1) {
  console.error('❌ 新用户名必须包含至少2个字母和1个数字');
  process.exit(1);
}

// 验证新密码格式
if (!/^[A-Za-z0-9]{6,12}$/.test(newPassword)) {
  console.error('❌ 新密码格式不正确');
  console.log('要求: 6-12位字母和数字组合');
  process.exit(1);
}

const pwdLetterCount = (newPassword.match(/[A-Za-z]/g) || []).length;
const pwdDigitCount = (newPassword.match(/[0-9]/g) || []).length;

if (pwdLetterCount < 2 || pwdDigitCount < 1) {
  console.error('❌ 新密码必须包含至少2个字母和1个数字');
  process.exit(1);
}

console.log(`Running: node backend/run-init.js ${accountId} ${newUsername} ${newPassword}`);

(async () => {
  try {
    const res = await query('SELECT * FROM crown_accounts WHERE id = $1', [accountId]);
    if (!res.rows.length) {
      console.error(`❌ 未找到ID为 ${accountId} 的账号`);
      process.exit(1);
    }

    const account = res.rows[0];
    console.log(`\n📋 账号信息:`);
    console.log(`   ID: ${account.id}`);
    console.log(`   当前用户名: ${account.username}`);
    console.log(`   当前密码: ${'*'.repeat(account.password.length)}`);
    console.log(`   新用户名: ${newUsername}`);
    console.log(`   新密码: ${'*'.repeat(newPassword.length)}`);

    // 检查新密码是否与当前密码相同
    if (account.password === newPassword) {
      console.error('\n❌ 新密码不能与当前密码相同！');
      console.log('请使用不同的密码，例如:');
      console.log(`   node backend/run-init.js ${accountId} ${newUsername} NewPass2024`);
      process.exit(1);
    }

    console.log(`\n🚀 开始初始化账号...\n`);

    const automation = getCrownAutomation();
    const result = await automation.initializeAccountCredentials(account, {
      username: newUsername,
      password: newPassword,
    });

    console.log('\nResult:', result);

    if (result.success) {
      console.log('\n✅ 账号初始化成功！');
      console.log(`   新用户名: ${result.updatedCredentials.username}`);
      console.log(`   新密码: ${'*'.repeat(result.updatedCredentials.password.length)}`);

      // 更新数据库
      await query(
        `UPDATE crown_accounts
         SET username = $1,
             password = $2,
             original_username = COALESCE(original_username, $3),
             initialized_username = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          result.updatedCredentials.username,
          result.updatedCredentials.password,
          account.username,
          accountId
        ]
      );
      console.log('✅ 数据库已更新');
      process.exit(0);
    } else {
      console.error('\n❌ 账号初始化失败');
      console.error(`   原因: ${result.message}`);

      if (result.updatedCredentials.username !== account.username) {
        console.log('\n⚠️ 用户名已部分更新，建议手动检查');
        console.log(`   当前用户名: ${result.updatedCredentials.username}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 执行过程中出错:', error);
    process.exit(1);
  }
})();
