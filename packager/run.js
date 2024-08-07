const fs = require('fs').promises;
const path = require('path');
const request = require('request-promise-native');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const directories = [
    '../libraries',
    '../readers',
    '../features',
    '../stores',
    '../caches'
];

const REQUEST_HOST = 'https://iwrpg.vectordungeon.com/';

async function run() {
    await cleanup();
    let result = await readFile('prefix.js');
    result += await readFile('moduleRegistry.js');
    for(const directory of directories) {
        const files = await readDir(directory);
        for(const filename of files) {
            if(filename.startsWith('_')) {
                continue;
            }
            result += await formatFile(directory, filename);
        }
    }
    result += await readFile('suffix.js');
    result = await fillPrefetchedCaches(result);
    writeFile('../plugin.js', result);
    console.log('Generated plugin.js');
}

async function cleanup() {
    await removeFile('../plugin.js');
}

async function formatFile(directory, filename) {
    const content = await readFile(`${directory}/${filename}`);
    filename = filename.split('.')[0];
    return `// ${filename}
window.moduleRegistry.add('${filename}', ${content});
`;
}

async function fillPrefetchedCaches(text) {
    const matches = [...text.matchAll(/requestWithFallback\('(\{.*?\})', '(.*?)'/g)];
    for(const match of matches) {
        text = text.replaceAll(match[1], await request(REQUEST_HOST + match[2]));
    }
    return text;
}

async function readFile(filename) {
    return await fs.readFile(path.resolve(__dirname, filename), 'utf8');
}

async function readDir(directory) {
    return await fs.readdir(path.resolve(__dirname, directory));
}

async function writeFile(filename, content) {
    fs.writeFile(path.resolve(__dirname, filename), content);
}

async function removeFile(filename, content) {
    try {
        return await fs.unlink(path.resolve(__dirname, filename), content);
    } catch(e) {
        if(e.code !== 'ENOENT') {
            throw e;
        }
    }
}

run();
