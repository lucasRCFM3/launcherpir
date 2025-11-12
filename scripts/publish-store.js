const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ENV_CANDIDATES = ['STORE_EXPORT_PATH', 'VITE_STORE_EXPORT_PATH'];

const resolveExportPath = () => {
  for (const key of ENV_CANDIDATES) {
    if (process.env[key]?.trim()) {
      return process.env[key].trim();
    }
  }

  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (ENV_CANDIDATES.includes(key) && value) {
        return value.replace(/^\"|\"$/g, '');
      }
    }
  }

  return null;
};

const exportPath = resolveExportPath();

if (!exportPath) {
  console.error('STORE_EXPORT_PATH (ou VITE_STORE_EXPORT_PATH) não definido.');
  process.exit(1);
}

if (!fs.existsSync(exportPath)) {
  console.error(`Arquivo ${exportPath} não encontrado. Exporte o catálogo antes de publicar.`);
  process.exit(1);
}

const repoDir = process.env.STORE_EXPORT_REPO
  ? path.resolve(process.env.STORE_EXPORT_REPO)
  : path.dirname(exportPath);

if (!fs.existsSync(path.join(repoDir, '.git'))) {
  console.error(`Diretório ${repoDir} não parece ser um repositório Git. Defina STORE_EXPORT_REPO se necessário.`);
  process.exit(1);
}

const fileName = path.relative(repoDir, exportPath);

const args = process.argv.slice(2);
const message = args[0] || `chore: update store catalog (${new Date().toISOString()})`;

const run = (command) => {
  execSync(command, { cwd: repoDir, stdio: 'inherit' });
};

run(`git add "${fileName}"`);

try {
  run(`git commit -m "${message.replace(/"/g, '\"')}"`);
} catch (error) {
  console.error('Nenhuma alteração para cometer ou commit falhou.');
  process.exit(1);
}

run('git push');

console.log('Catálogo publicado com sucesso.');
