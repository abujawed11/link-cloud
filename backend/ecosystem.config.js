// PM2 process list for Phase 4 deployment: the API and the download worker
// run as two separate processes, which is the whole point of Phase 3.
//
// Usage on the VPS: `pm2 start ecosystem.config.js`
module.exports = {
  apps: [
    {
      name: 'link-cloud-api',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1, // progress/concurrency state in jobEvents is per-process
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
    {
      name: 'link-cloud-worker',
      script: 'src/workers/downloadWorker.js',
      cwd: __dirname,
      // Multiple instances are safe (BullMQ coordinates via Redis) as long as
      // MAX_CONCURRENT_GLOBAL is set per-instance and that is acceptable, or
      // keep this at 1 and raise MAX_CONCURRENT_GLOBAL instead.
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
    },
  ],
};
