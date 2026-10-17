import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const component = process.argv[2];
if (!['frontend', 'backend'].includes(component))
  throw new Error('Usage: node scripts/stage-vercel.mjs frontend|backend');
const target = path.join(root, '.deploy', `vercel-${component}`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
  copyFileSync(path.join(root, file), path.join(target, file));
const excluded = new Set([
  'node_modules',
  '.git',
  '.vercel',
  'dist',
  'uploads',
  'tmp',
  'coverage',
  'tests',
  'seeders',
]);
cpSync(path.join(root, component), path.join(target, component), {
  recursive: true,
  filter: (source) => {
    const name = path.basename(source);
    return !excluded.has(name) && !name.startsWith('.env') && !/\.(test|spec)\.js$/.test(name);
  },
});
copyFileSync(
  path.join(root, 'deploy', `vercel.${component}.json`),
  path.join(target, 'vercel.json'),
);
if (component === 'backend') {
  mkdirSync(path.join(target, 'public'));
  copyFileSync(
    path.join(root, 'deploy', 'backend-index.html'),
    path.join(target, 'public', 'index.html'),
  );
  mkdirSync(path.join(target, 'api'));
  writeFileSync(
    path.join(target, 'api', 'index.js'),
    "export { default } from '../backend/api/[...path].js';\n",
  );
  const manifest = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
  manifest.type = 'module';
  writeFileSync(path.join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}
const link = path.join(root, component, '.vercel', 'project.json');
if (existsSync(link)) {
  mkdirSync(path.join(target, '.vercel'));
  copyFileSync(link, path.join(target, '.vercel', 'project.json'));
}
console.log(target);
