module.exports = {
  apps: [{
    name: 'vynsap',
    script: 'node_modules/.bin/next',
    args: 'start -p 3080',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' },
  }],
}
