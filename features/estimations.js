(events, components, util) => {

    const registerEstimationHandler = events.register.bind(null, 'estimation');
    const addComponent = components.addComponent;
    const removeComponent = components.removeComponent;
    const searchComponent = components.search;

    function initialise() {
        registerEstimationHandler(handleEstimationData);
    }

    function handleEstimationData(estimation) {
        if(!estimation) {
            removeComponent(componentBlueprint);
            return;
        }

        if(estimation.type === 'AUTOMATION') {
            componentBlueprint.dependsOn = 'home-page';
            componentBlueprint.parent = 'produce-component';
        } else {
            componentBlueprint.dependsOn = 'skill-page';
            componentBlueprint.parent = 'actions-component';
        }

        searchComponent(componentBlueprint, 'overviewSpeed').value
            = util.formatNumber(estimation.speed) + ' s';
        searchComponent(componentBlueprint, 'overviewExp').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewExp').value
            = util.formatNumber(estimation.exp);
        searchComponent(componentBlueprint, 'overviewSurvivalChance').hidden
            = estimation.type === 'ACTIVITY' || estimation.type === 'AUTOMATION';
        searchComponent(componentBlueprint, 'overviewSurvivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        searchComponent(componentBlueprint, 'overviewFinishedTime').value
            = util.secondsToDuration(estimation.secondsLeft);
        searchComponent(componentBlueprint, 'overviewLevelTime').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewLevelTime').value
            = util.secondsToDuration(estimation.secondsToNextlevel);
        searchComponent(componentBlueprint, 'overviewTierTime').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewTierTime').value
            = util.secondsToDuration(estimation.secondsToNextTier);
        searchComponent(componentBlueprint, 'overviewGoldLoot').hidden
            = estimation.goldLoot === 0;
        searchComponent(componentBlueprint, 'overviewGoldLoot').value
            = util.formatNumber(estimation.goldLoot);
        searchComponent(componentBlueprint, 'overviewGoldMaterials').hidden
            = estimation.goldMaterials === 0;
        searchComponent(componentBlueprint, 'overviewGoldMaterials').value
            = util.formatNumber(estimation.goldMaterials);
        searchComponent(componentBlueprint, 'overviewGoldEquipments').hidden
            = estimation.goldEquipments === 0;
        searchComponent(componentBlueprint, 'overviewGoldEquipments').value
            = util.formatNumber(estimation.goldEquipments);
        searchComponent(componentBlueprint, 'overviewGoldTotal').hidden
            = estimation.goldTotal === 0;
        searchComponent(componentBlueprint, 'overviewGoldTotal').value
            = util.formatNumber(estimation.goldTotal);
        searchComponent(componentBlueprint, 'tabTime').hidden
            = (estimation.materials.length + estimation.equipments.length) === 0;

        const dropRows = searchComponent(componentBlueprint, 'dropRows');
        const materialRows = searchComponent(componentBlueprint, 'materialRows');
        const timeRows = searchComponent(componentBlueprint, 'timeRows');
        dropRows.rows = [];
        materialRows.rows = [];
        timeRows.rows = [];
        for(const drop of estimation.loot) {
            dropRows.rows.push({
                type: 'item',
                image: `/assets/${drop.item?.image}`,
                imagePixelated: true,
                name: drop.item?.name,
                value: util.formatNumber(drop.amount) + ' / hour'
            });
        }
        for(const material of estimation.materials) {
            materialRows.rows.push({
                type: 'item',
                image: `/assets/${material.item?.image}`,
                imagePixelated: true,
                name: material.item?.name,
                value: util.formatNumber(material.amount) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${material.item?.image}`,
                imagePixelated: true,
                name: `${material.item?.name} [${util.formatNumber(material.stored)}]`,
                value: util.secondsToDuration(material.secondsLeft)
            });
        }
        for(const equipment of estimation.equipments) {
            materialRows.rows.push({
                type: 'item',
                image: `/assets/${equipment.item?.image}`,
                imagePixelated: true,
                name: equipment.item?.name,
                value: util.formatNumber(equipment.amount) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${equipment.item?.image}`,
                imagePixelated: true,
                name: `${equipment.item?.name} [${util.formatNumber(equipment.stored)}]`,
                value: util.secondsToDuration(equipment.secondsLeft)
            });
        }

        addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId: 'estimationComponent',
        dependsOn: 'skill-page',
        parent: 'actions-component',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'overviewSpeed',
                name: 'Time per action',
                image: 'https://cdn-icons-png.flaticon.com/512/3563/3563395.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewExp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewSurvivalChance',
                name: 'Survival chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewFinishedTime',
                name: 'Finished',
                image: 'https://cdn-icons-png.flaticon.com/512/1505/1505471.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewLevelTime',
                name: 'Level up',
                image: 'https://cdn-icons-png.flaticon.com/512/4614/4614145.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewTierTime',
                name: 'Tier up',
                image: 'https://cdn-icons-png.flaticon.com/512/4789/4789514.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldLoot',
                name: 'Gold/hour (loot)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldMaterials',
                name: 'Gold/hour (materials)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldEquipments',
                name: 'Gold/hour (equipments)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldTotal',
                name: 'Gold/hour (total)',
                image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            }]
        },{
            title: 'Items',
            rows: [{
                type: 'header',
                title: 'Produced'
            },{
                type: 'segment',
                id: 'dropRows',
                rows: []
            },{
                type: 'header',
                title: 'Consumed'
            },{
                type: 'segment',
                id: 'materialRows',
                rows: []
            }]
        },{
            title: 'Time',
            id: 'tabTime',
            rows: [{
                type: 'segment',
                id: 'timeRows',
                rows: []
            }]
        }]
    };

    initialise();

}
