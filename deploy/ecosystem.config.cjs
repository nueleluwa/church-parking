// How PM2 runs the app on the server (decision D-09). Started by deploy/deploy.sh.
// The app listens on 127.0.0.1 only, so the only way in from outside is through nginx.
// Settings (database address, secrets) come from /srv/church-parking/shared/.env.production.local,
// which Next.js reads by itself because each release links to it.
module.exports = {
  apps: [
    {
      name: "church-parking",
      cwd: "/srv/church-parking/current",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "20s",
      restart_delay: 2000,
      max_memory_restart: "700M",
      kill_timeout: 10000,
      time: true,
      out_file: "/home/deploy/.pm2/logs/church-parking-out.log",
      error_file: "/home/deploy/.pm2/logs/church-parking-error.log",
      merge_logs: true,
    },
  ],
};
