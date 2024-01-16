const fs = require('fs').promises;
const semverInc = require('semver/functions/inc');
const path = require('path');

async function run() {
    const content = await readFile('prefix.js');
    const from = /@version\W+(.*)/.exec(content)[1];
    const to = semverInc(from, process.argv[2]);
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
