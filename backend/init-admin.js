const axios = require('axios');

async function createAdminUser() {
    try {
        console.log('正在创建默认管理员账号...');

        const response = await axios.post('http://localhost:3001/api/auth/register', {
            username: 'admin',
            email: 'admin@zhitou.com',
            password: '123456',
            role: 'admin'
        });

        if (response.data.success) {
            console.log('✅ 管理员账号创建成功！');
            console.log('登录信息:');
            console.log('用户名: admin');
            console.log('密码: 123456');
        } else {
            console.log('❌ 账号创建失败:', response.data.error);
        }
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log('⚠️  管理员账号可能已存在');
            console.log('请使用以下信息登录(若已设为admin角色):');
            console.log('用户名: admin');
            console.log('密码: 123456');
        } else {
            console.error('❌ 网络错误:', error.message);
        }
    }
}

// 等待服务器启动后再创建账号
setTimeout(createAdminUser, 2000);
