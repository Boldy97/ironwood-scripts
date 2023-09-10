(pages, components, elementWatcher, easyRequests) => {

    let levelsAndXp = [];
    let skills = [];
    let uncollapsedSkill = undefined;
    let lastChart = undefined;

    async function initialise() {
        pages.registerPage(pageBlueprint, handlePage);
        levelsAndXp = await easyRequests.getLevelsAndXp();
        skills = await easyRequests.getSkills();

        skills = skills.filter(function( obj ) {
            return obj.name !== 'TotalExp' && obj.name !== 'TotalLevel';
        });

        //console.log(skills);
        levelsAndXp = levelsAndXp.map(obj => ({ ...obj, maxLevel: 100, showXP: true, showLvl: true }))
        //console.log(levelsAndXp);

        const totalLevel = levelsAndXp.reduce(function(sum, skill) {
            return sum + skill.level;
        }, 0);
        //console.log(totalLevel)
        const totalPossibleLevel = levelsAndXp.length * 100;
        //console.log(totalPossibleLevel)

        const totalXp = levelsAndXp.reduce(function(sum, skill) {
            return sum + skill.totalExp;
        }, 0);
        console.log(totalXp)
        const totalPossibleXp = levelsAndXp.length * 12000000;
        console.log(totalPossibleXp)

        levelsAndXp.push({
            skill: 'TotalLevel',
            level: totalLevel,
            exp: totalLevel,
            maxLevel: totalPossibleLevel,
            expToLevel: totalPossibleLevel - totalLevel,
            showXP: false,
            showLvl: true
        });

        levelsAndXp.push({
            skill: 'TotalExp',
            level: totalXp,
            exp: totalXp,
            maxLevel: totalPossibleXp,
            expToLevel: totalPossibleXp - totalXp,
            showXP: true,
            showLvl: false
        });

        // console.log(levelsAndXp);
    }

    async function handlePage() {
        await update();
    }

    function clear() {

    }

    async function update() {
        clear();
        await elementWatcher.exists(componentBlueprint.dependsOn);

        let column = 0;

        levelsAndXp.forEach(async skilldata => {
            componentBlueprint.componentId = 'skillOverviewComponent_' + skilldata.skill;
            componentBlueprint.parent = '.column' + column;
            column === 0 ? column = 1 : column = 0;

            const skillNameImageFix = {
                'OneHanded': 'one-handed',
                'TwoHanded': 'two-handed',
                'TotalExp': 'rank-one',
                'TotalLevel': 'rank-one',
            }
            let skillIcon = skillNameImageFix[skilldata.skill];
            if(!skillIcon) skillIcon = skilldata.skill.toLowerCase(); // lowercase important!

            const skillHeader = components.search(componentBlueprint, 'skillHeader');
            skillHeader.title = skilldata.skill;
            skillHeader.image = `/assets/misc/${skillIcon}.png`;
            if(skilldata.showLvl) {
                skillHeader.textRight = `Lv. ${skilldata.level} <span style='color: #aaa'>/ ${skilldata.maxLevel}</span>`;
            } else {
                skillHeader.textRight = '';
            }


            const skillProgress = components.search(componentBlueprint, 'skillProgress');
            if(skilldata.showXP) {
                skillProgress.progressText = `${skilldata.exp.toLocaleString('en-US')} / ${(skilldata.exp + skilldata.expToLevel).toLocaleString('en-US')} XP`;
            } else {
                skillProgress.progressText = '';
            }
            skillProgress.progressPercent = Math.trunc(skilldata.exp / (skilldata.exp + skilldata.expToLevel) * 100);
            skillProgress.color = skills.find(s => s.name === skilldata.skill)?.color || null;

            // const skillGraphHeader = components.search(componentBlueprint, 'skillGraphHeader');
            // skillGraphHeader.title = `${skilldata.skill} Progress Graph`;
            // skillGraphHeader.action = () => { toggleCollapsedState(skilldata.skill); }
            // if(skilldata.skill === uncollapsedSkill) {
            //     skillGraphHeader.name = '⬆️ Hide graph';
            // } else {
            //     skillGraphHeader.name = '⬇️ Show graph';
            // }

            // if(skilldata.skill === uncollapsedSkill) {
            //     componentBlueprint.tabs[0].rows.push({
            //         'id': 'skillChart',
            //         'type': 'chart',
            //         'chartId': 'myChart'
            //     })
            // } else {
            //     componentBlueprint.tabs[0].rows.length = 3;
            // }

            components.removeComponent(componentBlueprint);
            components.addComponent(componentBlueprint);

            // await elementWatcher.exists('#myChart');

            // if(lastChart) lastChart.destroy();
            // lastChart = new Chart($('#myChart'), {
            //     type: 'line',
            //     data: {
            //         labels: ['Teets', 'Nibbo', 'Brent', 'Panks', 'Eenie', 'Miny', 'Mo?'],
            //         datasets: [{
            //             label: 'Some line graph :)',
            //             data: [65, 59, 80, 81, 56, 55, 40],
            //             fill: false,
            //             borderColor: 'rgb(75, 192, 192)',
            //             tension: 0.1
            //         }]
            //     },
            //     // options: {
            //     //     scales: {
            //     //         y: {
            //     //             beginAtZero: true
            //     //         }
            //     //     }
            //     // }
            // });

        });
    }

    function toggleCollapsedState(skillname) {
        if(uncollapsedSkill === skillname) {
            uncollapsedSkill = undefined;
        } else {
            uncollapsedSkill = skillname;
        }
        update();
    }

    const pageBlueprint = {
        'category': 'Skills',
        'pageName': 'Overview',
        'pageImage': 'https://cdn-icons-png.flaticon.com/128/1160/1160329.png',
        'columns': '2',
        'onVisit': () => { }
    }

    const componentBlueprint = {
        'componentId': 'skillOverviewComponent',
        'dependsOn': 'custom-page',
        'parent': '.column0',
        'selectedTabIndex': 0,
        'tabs': [
            {
                'title': 'Skillname',
                'rows': [
                    {
                        'id': 'skillHeader',
                        'type': 'header',
                        'title': 'Forging',
                        'image': '/assets/misc/merchant.png',
                        'textRight': `Lv. 69 <span style='color: #aaa'>/ 420</span>`
                    },
                    {
                        'id': 'skillProgress',
                        'type': 'progress',
                        'progressText': '301,313 / 309,469 XP',
                        'progressPercent': '97'
                    },
                    // {
                    //     'id': 'skillGraphHeader',
                    //     'type': 'header',
                    //     'title': 'Skill Progress Graph',
                    //     'name': '⬇️ Show graph',
                    //     'color': 'inverse',
                    //     'action': () => { console.log('Header Action!'); }
                    // },
                ]
            },
        ]
    };

    initialise();
}