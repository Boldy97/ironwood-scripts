(pages, components, elementWatcher, skillStore, userStore, events, util, configuration) => {

    const registerUserStoreHandler = events.register.bind(null, 'userStore');

    const PAGE_NAME = 'Skill overview';
    const SKILL_COUNT = 13;
    const MAX_LEVEL = 100;
    const MAX_TOTAL_LEVEL = SKILL_COUNT * MAX_LEVEL;
    const MAX_TOTAL_EXP = SKILL_COUNT * util.levelToExp(MAX_LEVEL);

    let skillProperties = null;
    let skillTotalLevel = null;
    let skillTotalExp = null;

    async function initialise() {
        registerUserStoreHandler(handleuserStore);
        await pages.register({
            category: 'Skills',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/128/1160/1160329.png',
            columns: '2',
            render: renderPage
        });
        configuration.registerCheckbox({
            category: 'Pages',
            key: 'skill-overview-enabled',
            name: 'Skill Overview',
            default: true,
            handler: handleConfigStateChange
        });

        await setupSkillProperties();
        await handleuserStore();
    }

    async function setupSkillProperties() {
        await skillStore.ready;
        await userStore.ready;
        skillProperties = [];
        const skillIds = Object.keys(userStore.exp);
        for(const id of skillIds) {
            if(!skillStore.byId[id]) {
                continue;
            }
            skillProperties.push({
                id: id,
                name: skillStore.byId[id].name,
                image: skillStore.byId[id].image,
                color: skillStore.byId[id].color,
                defaultActionId: skillStore.byId[id].defaultActionId,
                maxLevel: MAX_LEVEL,
                showExp: true,
                showLevel: true
            });
        }
        skillProperties.push(skillTotalLevel = {
            id: skillStore.byName['Total-level'].id,
            name: 'Total Level',
            image: skillStore.byName['Total-level'].image,
            color: skillStore.byName['Total-level'].color,
            maxLevel: MAX_TOTAL_LEVEL,
            showExp: false,
            showLevel: true
        });
        skillProperties.push(skillTotalExp = {
            id: skillStore.byName['Total-exp'].id,
            name: 'Total Exp',
            image: skillStore.byName['Total-exp'].image,
            color: skillStore.byName['Total-exp'].color,
            maxLevel: MAX_TOTAL_EXP,
            showExp: true,
            showLevel: false
        });
    }

    function handleConfigStateChange(state, name) {
        if(state) {
            pages.show(PAGE_NAME);
        } else {
            pages.hide(PAGE_NAME);
        }
    }

    async function handleuserStore() {
        if(!skillProperties) {
            return;
        }
        await userStore.ready;

        let totalExp = 0;
        let totalLevel = 0;
        for(const skill of skillProperties) {
            if(skill.id <= 0) {
                continue;
            }
            let exp = userStore.exp[skill.id];
            skill.exp = util.expToCurrentExp(exp);
            skill.level = util.expToLevel(exp);
            skill.expToLevel = util.expToNextLevel(exp);
            totalExp += Math.min(exp, 12_000_000);
            totalLevel += Math.min(skill.level, 100);
        }

        skillTotalExp.exp = totalExp;
        skillTotalExp.level = totalExp;
        skillTotalExp.expToLevel = MAX_TOTAL_EXP - totalExp;
        skillTotalLevel.exp = totalLevel;
        skillTotalLevel.level = totalLevel;
        skillTotalLevel.expToLevel = MAX_TOTAL_LEVEL - totalLevel;

        pages.requestRender(PAGE_NAME);
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
            if(skill.defaultActionId) {
                componentBlueprint.onClick = util.goToPage.bind(null, `/skill/${skill.id}/action/${skill.defaultActionId}`);
            } else {
                delete componentBlueprint.onClick;
            }
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
