const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`Boutique en ligne démarrée : http://localhost:${port}`);
  console.log(`Administration : http://localhost:${port}/admin`);
});
