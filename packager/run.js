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

const caches = [{
    name: 'ACTION_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/action'
},{
    name: 'DROP_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/drop'
},{
    name: 'EXPEDITION_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/expedition'
},{
    name: 'EXPEDITION_DROP_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/expeditionDrop'
},{
    name: 'INGREDIENT_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/ingredient'
},{
    name: 'ITEM_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/item'
},{
    name: 'ITEM_ATTRIBUTE_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/itemAttribute'
},{
    name: 'MONSTER_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/monster'
},{
    name: 'PET_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/pet'
},{
    name: 'PET_PASSIVE_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/petPassive'
},{
    name: 'RECIPE_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/recipe'
},{
    name: 'SKILL_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/skill'
},{
    name: 'STRUCTURE_CACHE_DATA',
    endpoint: 'https://iwrpg.vectordungeon.com/public/list/structure'
}];

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
    for(const cache of caches) {
        text = text.replace(`{${cache.name}}`, await request(cache.endpoint));
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
