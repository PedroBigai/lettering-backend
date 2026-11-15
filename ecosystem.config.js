// Production process for PM2. Build first: `npm ci && npm run build`,
// then `pm2 start ecosystem.config.js` (or `pm2 reload ecosystem.config.js`).
module.exports = {
  apps: [
    {
      name: "Lettering backending",
      script: "dist/index.js",
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
