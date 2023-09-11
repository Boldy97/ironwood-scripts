(events, elementWatcher, request, util, configuration) => {

    let enabled = false;
    let leaderboards = null;

    async function initialise() {
        const category = configuration.registerCategory('ui-features', 'UI Features');
        configuration.registerToggle('guild-badges', 'Guild Badges', true, handleConfigStateChange, category);
        events.register('page', handlePage);
        addStyles();
    }

    async function handleConfigStateChange(state, name) {
        enabled = state;
        if(enabled && !leaderboards) {
            leaderboards = await request.getLeaderboardGuildRanks();
        }
    }

    async function handlePage(page) {
        if(!enabled || !leaderboards || page.type !== 'guild') {
            return;
        }
        await elementWatcher.exists('.card > button');
        setupGuildMenuButtons();
        await addSkillBadgesToGuildMembers();
    }

    async function setupGuildMenuButtons() {
        $(`button > div.name:contains('Members')`).on('click', async function() {
            await util.sleep(50);
            await addSkillBadgesToGuildMembers();
        });
    }

    async function addSkillBadgesToGuildMembers() {
        await elementWatcher.exists('.card > button');
        $('.customIcon').remove();

        const guildies = $('div.sort').parent().find('button.row');
        guildies.each(function(index) {
            const nameNode = $(this).find('div.name').find('div:first-child');
            const nameText = nameNode.text();

            const highscoreSkills = getHighscoresForPlayer(nameText);
            highscoreSkills.forEach(highscore => {
                addSkillIcon(nameNode, highscore.skill, highscore.rank);
            });

        });
    }

    function addSkillIcon(node, skillName, rank) {
        const skillNameImageFix = {
            'OneHanded' : 'one-handed',
            'TwoHanded' : 'two-handed',
            'TotalExp' : 'rank-one',
            'TotalLevel' : 'rank-one',
        }
        let skillIcon = skillNameImageFix[skillName];
        if(!skillIcon) skillIcon = skillName.toLowerCase(); // lowercase important!
        const customIcon =
            $('<div/>')
                .addClass('customIcon')
                .append(
                    $('<img/>')
                        .attr('src', `https://ironwoodrpg.com/assets/misc/${skillIcon}.png`)
                )
                .attr('title', `${skillName}${rank ? ` #${rank}` : ''}`);
        node.after(customIcon);
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0]
        if(!head) { return; }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
    }

    function getHighscoresForPlayer(playerName) {
        if(!leaderboards) return [];
        return leaderboards.filter(l => l.name === playerName);
    }

    const styles = `
        .customIcon {
            display: flex;
            width: 16px;
            min-width: 16px;
            height: 16px;
            margin-left: 4px;
        }
    `;

    initialise();

}
