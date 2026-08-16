module.exports = {
  apps: [
    {
      name: "dxbmovies",
      script: "server.js",
      cwd: "/home/ubuntu/dxbmovies",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
    {
      name: "dxbmovies-worker",
      script: "scripts/worker.js",
      cwd: "/home/ubuntu/dxbmovies",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
    }
  ],
};
