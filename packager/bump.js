import { promises as fs } from 'fs';
import semverInc from 'semver/functions/inc.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
    let content = await readFile('prefix.js');
    const from = /@version\W+(.*)/.exec(content)[1];
    const to = semverInc(from, process.argv[2]);
    content = content
        .split('[\r\n]+')
        .map(line => !line.toLowerCase().includes('version') ? line : line.replaceAll(from, to))
        .join('\n');
    writeFile('prefix.js', content.replaceAll(from, to));
    process.stdout.write(to);
}

async function readFile(filename) {
    return await fs.readFile(path.resolve(__dirname, filename), 'utf8');
}

async function writeFile(filename, content) {
    fs.writeFile(path.resolve(__dirname, filename), content);
}

run();
