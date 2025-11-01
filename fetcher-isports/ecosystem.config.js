module.exports = {
  apps: [{
    name: 'crown-fetcher-isports',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      ISPORTS_API_KEY: 'GvpziueL9ouzIJNj',
      DATA_DIR: './data',
      FULL_FETCH_INTERVAL: '60000',
      CHANGES_INTERVAL: '2000'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};

