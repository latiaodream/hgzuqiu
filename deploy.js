#!/usr/bin/env node

const { Client } = require('ssh2');
const fs = require('fs');

const config = {
  host: '47.238.112.207',
  port: 22,
  username: 'root',
  password: 'latiao@2025'
};

const commands = [
  {
    name: '拉取最新代码',
    cmd: 'cd /www/wwwroot/aibcbot.top && git pull origin main'
  },
  {
    name: '执行数据库迁移',
    cmd: 'cd /www/wwwroot/aibcbot.top && PGPASSWORD=AbDN22pKhcsNnJSk psql -h 127.0.0.1 -U hgzuqiu -d hgzuqiu -f backend/migrations/20251027_add_init_type.sql'
  },
  {
    name: '安装后端依赖',
    cmd: 'cd /www/wwwroot/aibcbot.top/backend && npm install'
  },
  {
    name: '构建后端',
    cmd: 'cd /www/wwwroot/aibcbot.top/backend && npm run build'
  },
  {
    name: '重启后端服务',
    cmd: '/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend'
  },
  {
    name: '安装前端依赖',
    cmd: 'cd /www/wwwroot/aibcbot.top/frontend && npm install'
  },
  {
    name: '构建前端',
    cmd: 'cd /www/wwwroot/aibcbot.top/frontend && npm run build'
  },
  {
    name: '重启 Nginx',
    cmd: 'nginx -s reload'
  },
  {
    name: '查看后端日志',
    cmd: '/www/server/nodejs/v22.18.0/bin/pm2 logs bclogin-backend --lines 20 --nostream'
  }
];

async function executeCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command.cmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';

      stream.on('close', (code, signal) => {
        if (code === 0) {
          resolve({ success: true, output, errorOutput });
        } else {
          resolve({ success: false, output, errorOutput, code });
        }
      }).on('data', (data) => {
        output += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        errorOutput += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

async function deploy() {
  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('==========================================');
      console.log('✅ SSH 连接成功！');
      console.log('==========================================\n');

      try {
        for (let i = 0; i < commands.length; i++) {
          const command = commands[i];
          console.log(`\n步骤 ${i + 1}/${commands.length}: ${command.name}...`);
          console.log('------------------------------------------');
          
          const result = await executeCommand(conn, command);
          
          if (result.success) {
            console.log(`✅ ${command.name}完成\n`);
          } else {
            console.log(`❌ ${command.name}失败 (退出码: ${result.code})\n`);
            if (command.name !== '执行数据库迁移') {
              // 数据库迁移可能因为已存在而失败，继续执行
              conn.end();
              reject(new Error(`${command.name}失败`));
              return;
            }
          }
        }

        console.log('\n==========================================');
        console.log('✅ 部署完成！');
        console.log('==========================================\n');
        console.log('访问地址: https://aibcbot.top');
        console.log('测试账号: zhuren / 123456\n');

        conn.end();
        resolve();
      } catch (error) {
        conn.end();
        reject(error);
      }
    }).on('error', (err) => {
      console.error('❌ SSH 连接失败:', err.message);
      reject(err);
    }).connect(config);
  });
}

console.log('==========================================');
console.log('开始部署到服务器...');
console.log('服务器: 47.238.112.207');
console.log('==========================================\n');

deploy().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ 部署失败:', error.message);
  process.exit(1);
});

