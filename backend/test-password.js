/**
 * 测试密码修改功能
 */
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || ''
});

async function testPassword() {
  try {
    console.log('\n🔍 开始测试密码功能...\n');

    // 查询 admin 用户
    console.log('=== 步骤1: 查询 admin 用户信息 ===');
    const userResult = await pool.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1',
      ['admin']
    );

    if (userResult.rows.length === 0) {
      console.log('❌ admin 用户不存在');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ 找到用户:', {
      id: user.id,
      username: user.username,
      email: user.email,
      password_hash_preview: user.password_hash.substring(0, 20) + '...'
    });

    // 测试几个常见密码
    const testPasswords = [
      'admin123',
      'admin',
      '123456',
      'password',
      'admin888'
    ];

    console.log('\n=== 步骤2: 测试常见密码 ===');
    for (const pwd of testPasswords) {
      const isMatch = await bcrypt.compare(pwd, user.password_hash);
      console.log(`密码 "${pwd}": ${isMatch ? '✅ 匹配' : '❌ 不匹配'}`);
      if (isMatch) {
        console.log(`\n🎉 找到正确密码: ${pwd}\n`);
        break;
      }
    }

    // 提示用户输入密码测试
    console.log('\n=== 步骤3: 手动测试密码 ===');
    console.log('如果需要测试特定密码，请运行：');
    console.log('node -e "const bcrypt = require(\'bcrypt\'); bcrypt.compare(\'你的密码\', \'' + user.password_hash + '\').then(r => console.log(r ? \'✅ 匹配\' : \'❌ 不匹配\'));"');

    // 查看最近的密码修改记录
    console.log('\n=== 步骤4: 查看用户更新时间 ===');
    const updateResult = await pool.query(
      'SELECT username, created_at, updated_at FROM users WHERE username = $1',
      ['admin']
    );
    console.log('用户信息:');
    console.table(updateResult.rows);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await pool.end();
  }
}

// 运行测试
testPassword();

