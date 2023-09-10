(request) => {

    const exports = {
        getLevelsAndXp,
        getGuildMembers,
        getLeaderboards,
        getSkills
    }

    async function getLevelsAndXp() {
        return await request('stats/skills');
    }

    async function getGuildMembers() {
        return await request('guild/members');
    }

    async function getLeaderboards() {
        return await request('leaderboard/ranks');
    }

    async function getSkills() {
        return await request('list/skills');
    }

    return exports;
}