import path from 'node:path';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import consola from 'consola';
import fs from 'fs-extra';
import { pascalCase } from 'scule';
import { XMLParser } from 'fast-xml-parser';

const PREFIX = 'ri-';
const LUCIDE_PREFIX = 'lu-';
const TARGET = 'src/icons/';
const CHUNK_SIZE = 500;

function resolveRoot(...dir) {
  return path.resolve(import.meta.dirname, '..', ...dir);
}

function resolveRemixIconDir() {
  return resolveRoot('node_modules', 'remixicon', 'icons');
}

function resolveLucideIconDir() {
  return resolveRoot('node_modules', 'lucide', 'dist', 'esm', 'icons');
}

function resolveCustomIconDir() {
  return resolveRoot('src', 'custom-icons');
}

async function loop(data, cb) {
  async function recursiveLoop(index) {
    if (index < data.length) {
      await cb(data[index], index);
      await recursiveLoop(index + 1);
    }
  }

  await recursiveLoop(0);
}

function chunkArray(a, n) {
  return [...new Array(Math.ceil(a.length / n))].map((_, i) =>
    a.slice(n * i, n + n * i),
  );
}

function getPathFromSvgString(svg) {
  const parser = new XMLParser({
    ignoreAttributes: false,
  });
  const obj = parser.parse(svg);

  function findFirstPath(node) {
    if (node.path)
      return node.path;
    if (node.g)
      return findFirstPath(node.g);
    return null;
  }

  const path = findFirstPath(obj.svg);
  return path['@_d'];
}

async function getAllSvgDataFromPath(pathDir) {
  const type = await lstat(pathDir);

  if (type.isDirectory()) {
    const res = [];
    const dirs = await readdir(pathDir);
    await loop(dirs, async (child) => {
      res.push(...(await getAllSvgDataFromPath(`${pathDir}/${child}`)));
    });
    return res;
  }

  try {
    const name = PREFIX + path.basename(pathDir).replace('.svg', '');
    const generatedName = pascalCase(name);
    const svg = await readFile(pathDir, 'utf8');
    const svgPath = getPathFromSvgString(svg);

    return [
      {
        name,
        generatedName,
        components: [
          ['path', { d: svgPath }],
        ],
      },
    ];
  }
  catch (error) {
    consola.warn(`Error while processing ${pathDir}`, error);
    return [];
  }
}

async function getLucideSvgDataFromPath(pathDir) {
  const type = await lstat(pathDir);
  if (type.isDirectory()) {
    const res = [];
    const dirs = await readdir(pathDir);
    await loop(dirs, async (child) => {
      if (child.endsWith('.js')) {
        res.push(...(await getLucideSvgDataFromPath(`${pathDir}/${child}`)));
      }
    });
    return res;
  }

  try {
    const filePath = path.basename(pathDir).replace('.js', '');
    const name = PREFIX + LUCIDE_PREFIX + filePath;
    const generatedName = pascalCase(name);
    const iconModule = await import(`${pathDir}`);
    const components = iconModule.default[2];

    return [{
      name,
      generatedName,
      components,
    }];
  }
  catch (error) {
    consola.warn(`Error while processing ${pathDir}`, error);
    return [];
  }
}

async function collectAllIconMetas() {
  const dirs = [resolveRemixIconDir(), resolveCustomIconDir()];
  const res = [];

  await loop(dirs, async (dir) => {
    res.push(...(await getAllSvgDataFromPath(dir)));
  });

  res.push(...(await getLucideSvgDataFromPath(resolveLucideIconDir())));

  return res;
}

async function generate() {
  fs.ensureDirSync(TARGET);
  const metadata = await collectAllIconMetas();
  await writeMetadata(metadata);
}

async function writeMetadata(metadata) {
  const chunks = chunkArray(metadata, CHUNK_SIZE);
  const names = [];

  let indexFileContent = '';

  await loop(chunks, async (chunk, index) => {
    const fileName = `icons_${index + 1}`;

    indexFileContent += `export * from './${fileName}';\n`;
    let chunkFileContent = `// Generated by scripts/generate-icons.js
/* eslint-disable */
/* prettier-ignore */
import { type GeneratedIcon } from '@/types/icons';\n
`;
    await loop(chunk, (icon) => {
      chunkFileContent += `export const ${icon.generatedName}: GeneratedIcon = {
  name: '${icon.name}',
  components: ${JSON.stringify(icon.components)},
};\n`;

      names.push(icon.name);
    });

    await writeFile(
      resolveRoot(`${TARGET}${fileName}.ts`),
      chunkFileContent,
      'utf8',
    );
  });

  indexFileContent += `export const RuiIcons = [${names
    .map(x => `"${x.replace('ri-', '')}"`)
    .join(',')}] as const;\n`;

  indexFileContent += `export type RuiIcons = string;\n`;
  indexFileContent += `
export function isRuiIcon(x: any): x is RuiIcons {
  return RuiIcons.includes(x);
}\n`.trim();

  await writeFile(resolveRoot(`${TARGET}index.ts`), indexFileContent, 'utf8');
}

await generate();
