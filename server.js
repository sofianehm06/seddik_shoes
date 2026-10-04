// Les versions de Node 22 antérieures à 22.13 demandent l'option --experimental-sqlite pour la base
// de données. Les hébergeurs lancent souvent "node server.js" directement : on relance alors le serveur
// avec la bonne option si besoin.
try {
  require('node:sqlite');
} catch {
  if (!process.execArgv.includes('--experimental-sqlite')) {
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['--experimental-sqlite', ...process.execArgv, __filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env,
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 1)));
    return;
  }
  throw new Error('Node.js 22.5 ou plus récent est nécessaire (module node:sqlite introuvable).');
}

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});

const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`Boutique en ligne démarrée : http://localhost:${port}`);
  console.log(`Administration : http://localhost:${port}/admin`);
});
