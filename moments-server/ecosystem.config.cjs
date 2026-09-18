/** PM2 process file — use this OR systemd, not both. */
module.exports = {
  apps: [
    {
      name: 'moments',
      script: 'src/index.js',
      cwd: __dirname,
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: 10000,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 10000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
