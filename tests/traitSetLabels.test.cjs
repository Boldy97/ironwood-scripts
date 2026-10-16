const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('../packager/node_modules/jsdom');

const source = fs.existsSync('features/traitSetLabels.js')
    ? fs.readFileSync('features/traitSetLabels.js', 'utf8') : '() => {}';
const groups = {
    Forest: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'],
    Mountain: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'],
    Ocean: ['Enchanting', 'Fishing', 'Cooking', 'Imbuing', 'Two-handed', 'Defense']
};
const skills = [...new Set([...Object.values(groups).flat(), 'Health'])]
    .map((displayName, id) => ({ id, displayName }));
const regionalSets = Object.entries(groups).map(([name, members]) => ({
    name, skills: skills.filter(s => members.includes(s.displayName)).map(s => s.id)
}));
const sets = [...regionalSets,
    { name: 'All', skills: skills.map(s => s.id) },
    { name: 'Gathering', skills: regionalSets[0].skills },
    { name: 'Other', skills: [skills.find(s => s.displayName === 'Health').id] }
];
const row = name => `<button class="row"><span class="image">🌲</span><span class="title">${name} XP</span><span class="effect">+20.29%</span><span class="level">Lv. 103</span></button>`;
const equippedRow = name => `<button class="row"><span class="image">🌲</span><div class="description"><div><span class="title">${name} XP</span><span class="effect">+18.65%</span></div><div class="diff">Lv. 90 <svg></svg> 92</div></div><div class="level">635,106 <span>XP</span></div></button>`;
const page = () => `<traits-page><div class="groups"><div class="first"><div class="card"><div class="header"><span class="name">Equipped</span></div>${equippedRow('Defense')}</div></div><div class="last"><div class="card"><div class="header"><span class="name">Traits</span></div>${skills.map(s => row(s.displayName)).join('')}${row('Miningology')}</div></div></div></traits-page>`;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
function setup(html = page()) {
    const dom = new JSDOM(`<body>${html}</body>`);
    let config, handler;
    let current = { type: 'traits', menu: 'traits' };
    const context = vm.createContext({ document: dom.window.document, MutationObserver: dom.window.MutationObserver });
    vm.runInContext(`(${source})`, context)(
        { registerCheckbox: item => { config = item; item.handler(item.default); } },
        { register: (_, fn) => { handler = fn; fn(current); }, getLast: () => current },
        { list: skills }, { list: sets, byName: Object.fromEntries(sets.map(set => [set.name, set])) },
        { addStyles: css => { const style = dom.window.document.createElement('style'); style.textContent = css; dom.window.document.head.append(style); } }
    );
    return { dom, document: dom.window.document, config, navigate: value => { current = value; handler(value); } };
}

test('labels match cache membership, include Equipped, exclude unrelated skills, and preserve title/level', async () => {
    const { dom, document, config } = setup();
    await settle();
    assert.equal(config?.name, 'Show Skill Set Labels');
    assert.equal(config.category, 'Traits');
    assert.equal(config.default, true);
    const rows = [...document.querySelectorAll('.last button.row')];
    for (const [i, skill] of skills.entries()) {
        const expected = skill.displayName === 'Defense' ? 'All Sets' : regionalSets.find(set => set.skills.includes(skill.id))?.name;
        const label = rows[i].querySelector('.trait-set-label');
        assert.equal(label?.textContent, expected);
        if (label) assert.ok(label.nextElementSibling.classList.contains('level'));
        assert.equal(rows[i].querySelector('.title').textContent, `${skill.displayName} XP`);
        assert.equal(rows[i].querySelector('.level').textContent, 'Lv. 103');
    }
    assert.equal(rows.at(-1).querySelector('.trait-set-label'), null);
    const equipped = document.querySelector('.first button.row');
    assert.equal(equipped.querySelector('.trait-set-label')?.textContent, 'All Sets');
    assert.equal(equipped.querySelector('.diff').textContent, 'Lv. 90  92');
    assert.equal(equipped.querySelector('.level').textContent, '635,106 XP');
    assert.equal(equipped.querySelector('.description').textContent, 'Defense XP+18.65%Lv. 90  92');
    dom.window.close();
});

test('toggle, sorting/filtering, text reuse, replacement, and navigation remain idempotent', async () => {
    const { dom, document, config, navigate } = setup();
    await settle();
    const card = document.querySelector('.last .card');
    const rows = [...card.querySelectorAll('button')];
    rows.reverse().forEach(button => card.append(button));
    rows[0].style.display = 'none';
    await settle();
    const count = document.querySelectorAll('.trait-set-label').length;
    assert.equal(count, 17);
    let mutations = 0;
    const observer = new dom.window.MutationObserver(records => mutations += records.length);
    observer.observe(document.body, { childList: true, subtree: true });
    await settle();
    assert.equal(mutations, 0, 'observers settle without feedback');
    const button = rows.find(button => button.querySelector('.title').textContent.startsWith('Woodcutting '));
    button.querySelector('.title').firstChild.data = 'Mining XP ';
    await settle();
    assert.equal(button.querySelector('.trait-set-label').textContent, 'Mountain');
    document.querySelector('.first .card').append(button);
    await settle();
    assert.equal(button.querySelector('.trait-set-label').textContent, 'Mountain');
    config.handler(false);
    assert.equal(document.querySelectorAll('.trait-set-label').length, 0);
    config.handler(true);
    await settle();
    assert.equal(document.querySelectorAll('.trait-set-label').length, count);
    document.querySelector('traits-page').outerHTML = page();
    await settle();
    assert.equal(document.querySelectorAll('.trait-set-label').length, count);
    navigate({ type: 'marks', menu: 'skill marks' });
    assert.equal(document.querySelectorAll('.trait-set-label').length, 0);
    navigate({ type: 'traits', menu: 'traits' });
    await settle();
    assert.equal(document.querySelectorAll('.trait-set-label').length, count);
    observer.disconnect();
    dom.window.close();
});

test('page arriving after the navigation event receives labels', async () => {
    const { dom, document } = setup('');
    document.body.innerHTML = page();
    await settle();
    assert.equal(document.querySelectorAll('.trait-set-label').length, 17);
    dom.window.close();
});

test('actual traitFilter sorting/filtering observer cooperates with labels', async () => {
    const { dom, document, navigate, config: labelsConfig } = setup();
    const $ = require('../packager/node_modules/jquery')(dom.window);
    // jsdom has no layout; give jQuery's visibility selector a display-based equivalent.
    $.expr.pseudos.visible = element => element.style.display !== 'none';
    $.expr.pseudos.hidden = element => element.style.display === 'none';
    let config, sort, blueprint;
    const context = vm.createContext({ document, MutationObserver: dom.window.MutationObserver, $ });
    vm.runInContext(`(${fs.readFileSync('features/traitFilter.js', 'utf8')})`, context)(
        { register: (_, handler) => { sort = handler; }, getLast: () => ({ type: 'traits', menu: 'traits' }) },
        { exists: async () => document.querySelector('traits-page') },
        { registerCheckbox: item => { config = item; } },
        { search: (value) => value.tabs[0].rows[0], addComponent: value => { blueprint = value; } },
        { getVariousEntry: async () => 'Name Desc', saveVariousEntry: () => {} },
        { addStyles: () => {} }, value => value,
        { list: skills.map(skill => ({ ...skill, type: skill.displayName === 'Woodcutting' ? 'Gathering' : 'Combat' })) },
        { byName: Object.fromEntries(sets.map(set => [set.name, set])) }
    );
    await settle();
    config.handler(true);
    await sort({ type: 'traits', menu: 'traits' });
    await settle();
    let rows = [...document.querySelectorAll('.last button.row')];
    assert.equal(rows[0].querySelector('.title').textContent, 'Woodcutting XP');
    assert.equal(document.querySelectorAll('.trait-set-label').length, 17);
    blueprint.tabs[0].rows[0].action('Only Gathering');
    await settle();
    rows = [...document.querySelectorAll('.last button.row')];
    assert.equal(rows.filter(row => row.style.display !== 'none').length, 1);
    assert.equal(document.querySelectorAll('.trait-set-label').length, 17);
    // Set filtering must work from cache data even with labels disabled.
    labelsConfig.handler(false);
    for (const [name, members] of Object.entries(groups)) {
        const dropdown = blueprint.tabs[0].rows[0];
        assert.ok(dropdown.options.some(option => option.value === `Only ${name}`));
        dropdown.action(`Only ${name}`);
        await settle();
        const visibleNames = [...document.querySelectorAll('.last button.row')]
            .filter(row => row.style.display !== 'none')
            .map(row => row.querySelector('.title').textContent.replace(/ XP$/, ''));
        assert.deepEqual(visibleNames.sort(), [...members].sort());
        assert.equal(document.querySelector('.first button.row').style.display, '');
    }
    // A newly rendered row is filtered under the retained Ocean selection.
    document.querySelector('.last .card').insertAdjacentHTML('beforeend', row('Woodcutting'));
    await settle();
    assert.equal(document.querySelector('.last button.row:last-of-type').style.display, 'none');
    blueprint.tabs[0].rows[0].action('None');
    await settle();
    assert.ok([...document.querySelectorAll('.last button.row')].every(row => row.style.display !== 'none'));
    let mutations = 0;
    const observer = new dom.window.MutationObserver(records => mutations += records.length);
    observer.observe(document.body, { childList: true, subtree: true });
    await settle();
    assert.equal(mutations, 0, 'both modules settle without an observer loop');
    observer.disconnect();
    navigate({ type: 'marks', menu: 'skill marks' });
    await sort({ type: 'marks', menu: 'skill marks' });
    dom.window.close();
});

test('distributed userscript registers the same standalone module', () => {
    const registrations = new Map();
    const context = vm.createContext({ window: {
        moduleRegistry: { add: (name, fn) => registrations.set(name, fn), build: () => {} }
    } });
    vm.runInContext(fs.readFileSync('plugin.js', 'utf8'), context);
    assert.equal(registrations.get('traitSetLabels')?.toString(), source.trim());
    assert.equal(registrations.get('traitFilter')?.toString(), fs.readFileSync('features/traitFilter.js', 'utf8').trim());
});

test('Equipped rerenders label regional skills and leave unrelated skills and other cards alone', async () => {
    const { dom, document, config } = setup();
    const equipped = document.querySelector('.first .card');
    equipped.innerHTML = '<div class="header"><span class="name">Equipped</span></div>'
        + equippedRow('Alchemy') + equippedRow('Health');
    const other = document.createElement('div');
    other.className = 'card';
    other.innerHTML = '<div class="header"><span class="name">Info</span></div>' + row('Woodcutting');
    document.querySelector('.first').append(other);
    await settle();
    assert.equal(equipped.querySelector('.trait-set-label')?.textContent, 'Forest');
    assert.equal(equipped.querySelectorAll('.trait-set-label').length, 1);
    assert.equal(other.querySelector('.trait-set-label'), null);
    config.handler(false);
    assert.equal(document.querySelectorAll('.trait-set-label').length, 0);
    config.handler(true);
    await settle();
    assert.equal(equipped.querySelectorAll('.trait-set-label').length, 1);
    dom.window.close();
});

test('Equipped XP column reserves space independently of changing XP text', async () => {
    const { dom, document } = setup();
    await settle();
    const row = document.querySelector('.first button.row');
    const xp = row.querySelector('.level');
    const label = row.querySelector('.trait-set-label');
    const style = dom.window.getComputedStyle(xp);
    assert.notEqual(style.flexBasis, '', 'XP needs an explicit reserved column');
    assert.notEqual(style.flexBasis, 'auto', 'XP content must not determine column width');
    assert.equal(style.flexShrink, '0');
    const basis = style.flexBasis;
    for (const value of ['1 ', '999,999 ', '1,000,000 ', '99,999,999 ']) {
        xp.firstChild.data = value;
        await settle();
        assert.equal(dom.window.getComputedStyle(xp).flexBasis, basis);
        assert.equal(row.querySelector('.trait-set-label'), label);
        assert.equal(row.querySelectorAll('.trait-set-label').length, 1);
        assert.equal(xp.textContent, `${value}XP`);
    }
    dom.window.close();
});

test('numeric column rules explicitly outrank normal game flex declarations', async () => {
    const { dom, document } = setup();
    await settle();
    // jsdom does not consistently resolve important longhands against a later
    // flex shorthand. Check CSSOM priorities here; verify the cascade and
    // label geometry with a conflicting game rule in a real browser.
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
    const equipped = rules.find(rule => rule.selectorText === 'traits-page .trait-set-equipped-value');
    const numeric = rules.find(rule => rule.selectorText === 'traits-page .trait-set-value');
    assert.equal(equipped.style.getPropertyPriority('flex-basis'), 'important');
    assert.equal(equipped.style.getPropertyPriority('width'), 'important');
    assert.equal(numeric.style.getPropertyPriority('flex'), 'important');
    dom.window.close();
});

test('layout hooks apply directly to values and follow row reuse and toggle cleanup', async () => {
    const { dom, document, config } = setup();
    await settle();
    const equipped = document.querySelector('.first button.row');
    const main = document.querySelector('.last button.row');
    assert.ok(equipped.classList.contains('trait-set-equipped-row'));
    assert.ok(equipped.querySelector('.level').classList.contains('trait-set-equipped-value'));
    assert.ok(main.querySelector('.level').classList.contains('trait-set-value'));
    document.querySelector('.last .card').append(equipped);
    await settle();
    assert.equal(equipped.classList.contains('trait-set-equipped-row'), false);
    assert.equal(equipped.querySelector('.level').classList.contains('trait-set-equipped-value'), false);
    assert.ok(equipped.querySelector('.level').classList.contains('trait-set-value'));
    main.querySelector('.title').textContent = 'Health XP';
    await settle();
    assert.equal(main.querySelector('.level').classList.contains('trait-set-value'), false);
    config.handler(false);
    assert.equal(document.querySelectorAll('.trait-set-value, .trait-set-equipped-value, .trait-set-equipped-row').length, 0);
    config.handler(true);
    await settle();
    assert.ok(equipped.querySelector('.level').classList.contains('trait-set-value'));
    dom.window.close();
});
