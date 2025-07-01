(configuration, events, skillCache, skillSetCache, elementCreator, colorMapper, util) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'marks-grouper',
            name: 'Marks Grouper',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', handlePage);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'marks' || page.menu !== 'skill marks') {
            return;
        }
        const rowContainer = $('marks-page .header:contains("Skill Marks")').closest('.card');
        const forest = $('<section><div class="marks-region-name">Forest Set<span class="marks-region-count"></span></div></section>');
        const mountain = $('<section><div class="marks-region-name">Mountain Set<span class="marks-region-count"></span></div></section>');
        const ocean = $('<section><div class="marks-region-name">Ocean Set<span class="marks-region-count"></span></div></section>');
        rowContainer.append(forest, mountain, ocean);
        rowContainer.find('.row').each((_, element) => {
            element = $(element);
            const skillName = element.find('.name').text().replace(/ Mark$/, '');
            const skill = findSkillByLowerCase(skillName);
            const regions = getRegionsFromId(skill.id, [forest, mountain, ocean]);
            const level = util.parseNumber(element.find('.amount').text());
            if(regions.length) {
                for(const region of regions) {
                    region.unlockedCount = (region.unlockedCount || 0) + level;
                    region.totalCount = (region.totalCount || 0) + 1;
                    region.append(element.clone());
                }
                element.remove();
            }
        });
        forest.find('.marks-region-count').text(`${forest.unlockedCount} / ${forest.totalCount}`);
        mountain.find('.marks-region-count').text(`${mountain.unlockedCount} / ${mountain.totalCount}`);
        ocean.find('.marks-region-count').text(`${ocean.unlockedCount} / ${ocean.totalCount}`);
    }


    function findSkillByLowerCase(name) {
        name = name.toLowerCase();
        const withUpperCase = Object.keys(skillCache.byName).find(a => a.toLowerCase() === name);
        return skillCache.byName[withUpperCase];
    }

    function getRegionsFromId(skillId, regions) {
        const result = [];
        if(skillSetCache.byName.Forest.skills.some(a => a === skillId)) {
            result.push(regions[0]);
        }
        if(skillSetCache.byName.Mountain.skills.some(a => a === skillId)) {
            result.push(regions[1]);
        }
        if(skillSetCache.byName.Ocean.skills.some(a => a === skillId)) {
            result.push(regions[2]);
        }
        return result;
    }

    const styles = `
        .marks-region-name {
            padding: 1rem 3rem;
            background-color: ${colorMapper('componentRegular')};
        }
        .marks-region-count {
            float: right;
        }
        marks-page .card .row:last-of-type {
            border-bottom: 1px solid #263849;
        }
    `;

    initialise();

}
