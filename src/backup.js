// Sauvegarde : un fichier .zip contenant la base de données et toutes les photos produits.
// ZIP sans compression (les photos sont déjà compressées), écrit fichier par fichier pour ne pas
// charger toutes les photos en mémoire.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function writeZip(out, entries) {
  const write = (buf) =>
    new Promise((resolve, reject) => {
      if (out.write(buf)) return resolve();
      out.once('drain', resolve);
      out.once('error', reject);
    });
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.data ?? (await fs.promises.readFile(entry.file));
    const name = Buffer.from(entry.name, 'utf8');
    const crc = zlib.crc32(data);
    const { time, day } = dosDateTime(entry.date || new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(0, 8); // pas de compression
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([header, name]));

    await write(Buffer.concat([local, name]));
    await write(data);
    offset += local.length + name.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  await write(dir);
  await write(end);
}

// Copie cohérente de la base (même pendant que des commandes arrivent) via VACUUM INTO.
function snapshotDb(db) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bougie-backup-')), 'boutique.db');
  db.prepare('VACUUM INTO ?').run(file);
  const data = fs.readFileSync(file);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  return data;
}

async function streamBackup(out, { db, uploadsDir }) {
  const entries = [{ name: 'boutique.db', data: snapshotDb(db) }];
  for (const name of fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []) {
    const file = path.join(uploadsDir, name);
    const stat = fs.statSync(file);
    if (stat.isFile() && !name.startsWith('.')) entries.push({ name: `uploads/${name}`, file, date: stat.mtime });
  }
  entries.push({
    name: 'LISEZMOI.txt',
    data: Buffer.from(
      [
        'Sauvegarde Bougie Shoes',
        `Faite le ${new Date().toLocaleString('fr-FR')}`,
        '',
        'Pour restaurer : arrêter le site, remplacer le fichier de base (DB_FILE) par boutique.db',
        'et copier le contenu du dossier uploads/ dans le dossier des photos (UPLOADS_DIR), puis redémarrer.',
      ].join('\r\n')
    ),
  });
  await writeZip(out, entries);
  return entries.length;
}

module.exports = { streamBackup, writeZip };
