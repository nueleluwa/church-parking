// How PM2 runs the app on the server (decision D-09). Started by deploy/church-deploy.sh.
// The app listens on 127.0.0.1 only, so the only way in from outside is through nginx.
// Its settings (database address, secrets) come from /srv/church-parking/shared/.env.production.local,
// which Next.js reads by itself because each release links to it.
// The port is not fixed: provision.sh picks a free one on this server and writes it to ports.json.
const ports = require("/srv/church-parking/shared/ports.json");

module.exports = {
  apps: [
    {
      name: "church-parking",
      cwd: "/srv/church-parking/current",
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${ports.app} -H 127.0.0.1`,
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
