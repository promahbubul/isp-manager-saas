/**
 * PM2 process file. From the repo root on the server:
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * isp-api    — HTTP API, 2 instances (cluster). Cron jobs OFF here.
 * isp-worker — runs the cron jobs. Exactly ONE instance, otherwise jobs run twice.
 * isp-web    — Next.js frontend.
 *
 * Secrets live in backend/.env and frontend/.env.local, not in this file.
 */
const path = require("path");
const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "isp-api",
      cwd: path.join(root, "backend"),
      script: "dist/server.js",
      exec_mode: "cluster",
      instances: 2,
      env: { NODE_ENV: "production", RUN_JOBS: "false" },
      max_memory_restart: "600M",
      kill_timeout: 10000,
      time: true,
    },
    {
      name: "isp-worker",
      cwd: path.join(root, "backend"),
      script: "dist/worker.js",
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      max_memory_restart: "400M",
      kill_timeout: 30000, // let a running job finish its router batch
      time: true,
    },
    {
      name: "isp-web",
      cwd: path.join(root, "frontend"),
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
      time: true,
    },
  ],
};
