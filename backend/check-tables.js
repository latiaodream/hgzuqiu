/**
 * 检查数据库表结构
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || ''
});

async function checkTables() {
  try {
    console.log('\n🔍 开始检查数据库表结构...\n');

    // 检查所有表
    console.log('=== 步骤1: 检查所有表 ===');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('数据库中的表:');
    console.table(tablesResult.rows);

    // 检查 crown_accounts 表结构
    console.log('\n=== 步骤2: 检查 crown_accounts 表结构 ===');
    const accountsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'crown_accounts'
      ORDER BY ordinal_position
    `);
    
    if (accountsColumns.rows.length > 0) {
      console.log('✅ crown_accounts 表存在');
      console.log('字段列表:');
      console.table(accountsColumns.rows);
    } else {
      console.log('❌ crown_accounts 表不存在');
    }

    // 检查 groups 表结构
    console.log('\n=== 步骤3: 检查 groups 表结构 ===');
    const groupsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'groups'
      ORDER BY ordinal_position
    `);
    
    if (groupsColumns.rows.length > 0) {
      console.log('✅ groups 表存在');
      console.log('字段列表:');
      console.table(groupsColumns.rows);
    } else {
      console.log('❌ groups 表不存在');
    }

    // 检查 users 表结构
    console.log('\n=== 步骤4: 检查 users 表结构 ===');
    const usersColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    if (usersColumns.rows.length > 0) {
      console.log('✅ users 表存在');
      console.log('字段列表:');
      console.table(usersColumns.rows);
    } else {
      console.log('❌ users 表不存在');
    }

    // 检查数据
    console.log('\n=== 步骤5: 检查数据 ===');
    
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`用户数量: ${usersCount.rows[0].count}`);
    
    const groupsCount = await pool.query('SELECT COUNT(*) FROM groups');
    console.log(`分组数量: ${groupsCount.rows[0].count}`);
    
    const accountsCount = await pool.query('SELECT COUNT(*) FROM crown_accounts');
    console.log(`账号数量: ${accountsCount.rows[0].count}`);

    // 如果 groups 表为空，提示需要创建默认分组
    if (parseInt(groupsCount.rows[0].count) === 0) {
      console.log('\n⚠️  警告: groups 表为空！');
      console.log('需要为每个用户创建默认分组。');
      console.log('\n建议执行以下SQL:');
      console.log(`
INSERT INTO groups (user_id, name, description)
SELECT id, '默认分组', '系统自动创建的默认分组'
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM groups WHERE groups.user_id = users.id
);
      `);
    }

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error('详细错误:', error);
  } finally {
    await pool.end();
  }
}

// 运行检查
checkTables();

