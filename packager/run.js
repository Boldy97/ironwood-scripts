const fs = require('fs').promises;
const path = require('path');

const directories = [
    '../libraries',
    '../features',
    '../stores'
];

async function run() {
    let result = await readFile('prefix.js');
    result += await readFile('moduleRegistry.js');
    for(const directory of directories) {
        const files = await readDir(directory);
        for(const file of files) {
            result += await formatFile(directory, file);
        }
    }
    result += await readFile('suffix.js');
    writeFile('../plugin.js', result);
}

async function formatFile(directory, filename) {
    const content = await readFile(`${directory}/${filename}`);
    filename = filename.split('.')[0];
    return `// ${filename}
window.moduleRegistry.add('${filename}', ${content});
`;
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

run();
