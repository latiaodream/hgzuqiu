const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bclogin_system',
  user: process.env.DB_USER || 'lt',
  password: process.env.DB_PASSWORD || ''
});

async function checkData() {
  try {
    console.log('\n=== 所有用户 ===');
    const users = await pool.query('SELECT id, username, email, role, agent_id FROM users ORDER BY id');
    console.table(users.rows);

    console.log('\n=== 下注记录表结构 ===');
    const betsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bets' 
      ORDER BY ordinal_position
    `);
    console.table(betsColumns.rows);

    console.log('\n=== 最近10条下注记录（检查 user_id）===');
    const bets = await pool.query(`
      SELECT b.id, b.user_id, u.username, u.role, b.account_id, b.status, b.bet_amount, b.created_at
      FROM bets b
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);
    console.table(bets.rows);

    console.log('\n=== 最近10条金币交易记录（检查 user_id）===');
    const coins = await pool.query(`
      SELECT ct.id, ct.user_id, u.username, u.role, ct.transaction_type, ct.amount, ct.created_at 
      FROM coin_transactions ct 
      LEFT JOIN users u ON ct.user_id = u.id 
      ORDER BY ct.created_at DESC 
      LIMIT 10
    `);
    console.table(coins.rows);

    console.log('\n=== 统计：各用户的下注记录数 ===');
    const betStats = await pool.query(`
      SELECT u.id, u.username, u.role, COUNT(b.id) as bet_count
      FROM users u
      LEFT JOIN bets b ON u.id = b.user_id
      GROUP BY u.id, u.username, u.role
      ORDER BY u.id
    `);
    console.table(betStats.rows);

    console.log('\n=== 统计：各用户的金币交易记录数 ===');
    const coinStats = await pool.query(`
      SELECT u.id, u.username, u.role, COUNT(ct.id) as transaction_count
      FROM users u
      LEFT JOIN coin_transactions ct ON u.id = ct.user_id
      GROUP BY u.id, u.username, u.role
      ORDER BY u.id
    `);
    console.table(coinStats.rows);

    await pool.end();
  } catch (error) {
    console.error('查询错误:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkData();

