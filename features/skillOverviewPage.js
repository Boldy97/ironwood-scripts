(pages, components, elementWatcher, skillCache, userCache, events, util, configuration) => {

    const registerUserCacheHandler = events.register.bind(null, 'userCache');
    const requestRender = pages.requestRender.bind(null, 'Overview');

    const SKILL_COUNT = 13;
    const MAX_LEVEL = 100;
    const MAX_TOTAL_LEVEL = SKILL_COUNT * MAX_LEVEL;
    const MAX_TOTAL_EXP = SKILL_COUNT * util.levelToExp(MAX_LEVEL);

    let skillProperties = null;
    let skillTotalLevel = null;
    let skillTotalExp = null;

    async function initialise() {
        registerUserCacheHandler(handleUserCache);
        await pages.register({
            category: 'Skills',
            name: 'Overview',
            image: 'https://cdn-icons-png.flaticon.com/128/1160/1160329.png',
            columns: '2',
            render: renderPage
        });
        const category = configuration.registerCategory('pages', 'Pages');
        configuration.registerToggle('skill-overview-enabled', 'Skill Overview', false, handleConfigStateChange, category);

        await setupSkillProperties();
        await handleUserCache();
    }

    async function setupSkillProperties() {
        await skillCache.ready;
        await userCache.ready;
        skillProperties = [];
        const skillIds = Object.keys(userCache.exp);
        for(const id of skillIds) {
            if(!skillCache.byId[id]) {
                continue;
            }
            skillProperties.push({
                id: id,
                name: skillCache.byId[id].name,
                image: skillCache.byId[id].image,
                color: skillCache.byId[id].color,
                maxLevel: MAX_LEVEL,
                showExp: true,
                showLvl: true
            });
        }
        skillProperties.push(skillTotalLevel = {
            id: skillCache.byName['Total-level'].id,
            name: 'TotalLevel',
            image: skillCache.byName['Total-level'].image,
            color: skillCache.byName['Total-level'].color,
            maxLevel: MAX_TOTAL_LEVEL,
            showExp: false,
            showLevel: true
        });
        skillProperties.push(skillTotalExp = {
            id: skillCache.byName['Total-exp'].id,
            name: 'TotalExp',
            image: skillCache.byName['Total-exp'].image,
            color: skillCache.byName['Total-exp'].color,
            maxLevel: MAX_TOTAL_EXP,
            showExp: true,
            showLevel: false
        });
    }

    function handleConfigStateChange(state, name) {
        if(state) {
            pages.show('Overview');
        } else {
            pages.hide('Overview');
        }
    }

    async function handleUserCache() {
        if(!skillProperties) {
            return;
        }
        await userCache.ready;

        let totalExp = 0;
        let totalLevel = 0;
        for(const skill of skillProperties) {
            if(skill.id <= 0) {
                continue;
            }
            let exp = userCache.exp[skill.id];
            skill.exp = util.expToCurrentExp(exp);
            skill.level = util.expToLevel(exp);
            skill.expToLevel = util.expToNextLevel(exp);
            totalExp += exp;
            totalLevel += skill.level;
        }

        skillTotalExp.exp = totalExp;
        skillTotalExp.level = totalExp;
        skillTotalExp.expToLevel = MAX_TOTAL_EXP - totalExp;
        skillTotalLevel.exp = totalLevel;
        skillTotalLevel.level = totalLevel;
        skillTotalLevel.expToLevel = MAX_TOTAL_LEVEL - totalLevel;

        requestRender();
    }

    async function renderPage() {
        if(!skillProperties) {
            return;
        }
        await elementWatcher.exists(componentBlueprint.dependsOn);

        let column = 0;

        for(const skill of skillProperties) {
            componentBlueprint.componentId = 'skillOverviewComponent_' + skill.name;
            componentBlueprint.parent = '.column' + column;
            column = 1 - column; // alternate columns

            const skillHeader = components.search(componentBlueprint, 'skillHeader');
            skillHeader.title = skill.name;
            skillHeader.image = `/assets/${skill.image}`;
            if(skill.showLevel) {
                skillHeader.textRight = `Lv. ${skill.level} <span style='color: #aaa'>/ ${skill.maxLevel}</span>`;
            } else {
                skillHeader.textRight = '';
            }


            const skillProgress = components.search(componentBlueprint, 'skillProgress');
            if(skill.showExp) {
                skillProgress.progressText = `${util.formatNumber(skill.exp)} / ${util.formatNumber(skill.exp + skill.expToLevel)} XP`;
            } else {
                skillProgress.progressText = '';
            }
            skillProgress.progressPercent = Math.floor(skill.exp / (skill.exp + skill.expToLevel) * 100);
            skillProgress.color = skill.color;

            components.addComponent(componentBlueprint);
        }
    }

    const componentBlueprint = {
        componentId: 'skillOverviewComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [
            {
                title: 'Skillname',
                rows: [
                    {
                        id: 'skillHeader',
                        type: 'header',
                        title: 'Forging',
                        image: '/assets/misc/merchant.png',
                        textRight: `Lv. 69 <span style='color: #aaa'>/ 420</span>`
                    },
                    {
                        id: 'skillProgress',
                        type: 'progress',
                        progressText: '301,313 / 309,469 XP',
                        progressPercent: '97'
                    }
                ]
            },
        ]
    };

    initialise();
}