(events, elementWatcher, dropCache, itemCache, configuration) => {
    const THICCNESS = 60;

    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const World = Matter.World;
    const Composite = Matter.Composite;

    const CLUMPDENSITY_MIN = 2;
    const CLUMPDENSITY_DEFAULT = 10;
    const CLUMPDENSITY_MAX = 100;

    const MAX_SAME_DENSITY_MIN = 2;
    const MAX_SAME_DENSITY_DEFAULT = 10;
    const MAX_SAME_DENSITY_MAX = 100;

    const ORIGINAL_IMAGESIZE = 32;
    const DESIRED_IMAGESIZE = 24;

    const IMAGESIZE_INCREASE_MIN = 1;
    const IMAGESIZE_INCREASE_DEFAULT = 1.25;
    const IMAGESIZE_INCREASE_MAX = 2;

    const ENABLED_PAGES = ['action']; //,'taming','automation'

    var loadedImages = [];
    var engine;
    var render;
    var killswitch;

    let busy = false;
    let enabled = false;
    let backgroundUrl = undefined;
    let clumpsize = CLUMPDENSITY_DEFAULT;
    let max_same_density = MAX_SAME_DENSITY_DEFAULT;
    let imagesize_increase = IMAGESIZE_INCREASE_DEFAULT;

    var items = [];
    var lastLoot = {};

    async function initialise() {
        addStyles();
        configuration.registerCheckbox({
            category: 'Animated Loot',
            key: 'animated-loot-enabled',
            name: 'Animated Loot Enabled',
            default: false,
            handler: handleConfigEnabledStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-max-same-density',
            name: `[${MAX_SAME_DENSITY_MIN} - ${MAX_SAME_DENSITY_MAX}]`,
            default: MAX_SAME_DENSITY_DEFAULT,
            inputType: 'number',
            text: 'Max amount of items of same type and weight before clumping occurs',
            layout: '5/1',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigMaxSameDensityStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-clumpdensity',
            name: `[${CLUMPDENSITY_MIN} - ${CLUMPDENSITY_MAX}]`,
            default: CLUMPDENSITY_DEFAULT,
            inputType: 'number',
            text: 'Amount of items that will clump together when treshold is reached',
            layout: '5/1',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigClumpSizeStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-clump-imagesize-increase',
            name: `[${IMAGESIZE_INCREASE_MIN} - ${IMAGESIZE_INCREASE_MAX}]`,
            default: IMAGESIZE_INCREASE_DEFAULT,
            inputType: 'number',
            text: 'Factor that determines how much larger a clumped item image will be',
            layout: '5/1',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigClumpImageSizeIncreaseStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-background',
            name: 'png, jpeg, webm, gif, etc.',
            default: '',
            inputType: 'text',
            text: 'Background URL',
            layout: '1/3',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigBackgroundStateChange,
        });
        events.register('page', handlePage);
        events.register('state-loot', handleLoot);
    }

    function handleConfigEnabledStateChange(state) {
        enabled = state;
    }

    function handleConfigMaxSameDensityStateChange(state) {
        if(!state || state === '') {
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            return;
        }
        if(state < clumpsize) {
            //just reset it to default to prevent stuck in while
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            clumpsize = CLUMPDENSITY_DEFAULT;
            return;
        }
        if(state < MAX_SAME_DENSITY_MIN) {
            max_same_density = MAX_SAME_DENSITY_MIN;
            return;
        }
        if(state > MAX_SAME_DENSITY_MAX) {
            max_same_density = MAX_SAME_DENSITY_MAX;
            return;
        }
        max_same_density = state;
    }

    function handleConfigClumpSizeStateChange(state) {
        if(!state || state === '') {
            clumpsize = CLUMPDENSITY_DEFAULT;
            return;
        }
        if(state > max_same_density) {
            //just reset it to default to prevent stuck in while
            clumpsize = CLUMPDENSITY_DEFAULT;
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            return;
        }
        if(state < CLUMPDENSITY_MIN) {
            clumpsize = CLUMPDENSITY_MIN;
            return;
        }
        if(state > CLUMPDENSITY_MAX) {
            clumpsize = CLUMPDENSITY_MAX;
            return;
        }
        clumpsize = state;
    }

    function handleConfigClumpImageSizeIncreaseStateChange(state) {
        if(!state || state === '') {
            imagesize_increase = IMAGESIZE_INCREASE_DEFAULT;
            return;
        }
        if(state < IMAGESIZE_INCREASE_MIN) {
            imagesize_increase = IMAGESIZE_INCREASE_MIN;
            return;
        }
        if(state > IMAGESIZE_INCREASE_MAX) {
            imagesize_increase = IMAGESIZE_INCREASE_MAX;
            return;
        }
        imagesize_increase = state;
    }

    function handleConfigBackgroundStateChange(state) {
        backgroundUrl = state;
    }

    async function handlePage(page) {
        if (!enabled) return;
        reset();
        if (!ENABLED_PAGES.includes(page.type)) return;

        //await ensureImagesLoaded(page.action);

        const initial = events.getLast('state-loot');
        await handleLoot(initial);
    }

    async function handleLoot(lootState) {
        if (!enabled) return;
        if (!lootState) return;
        if (busy) {
            //console.log('skipped cuz busy');
            return;
        }
        try {
            busy = true;
            const page = events.getLast('page');
            if (lootState.action !== page.action) return;

            const itemWrapper = $('#itemWrapper');
            if (!itemWrapper.length) {
                await createItemWrapper();
            }

            const delta = objDelta(lastLoot, lootState.loot);
            //console.log('handleLoot', delta);
            lastLoot = lootState.loot;

            for (const [id, val] of Object.entries(delta)) {
                if (val > 0) {
                    await loadImage(id);
                    addItem(id, val);
                }
            }
        }
        finally {
            busy = false;
        }
    }

    async function createItemWrapper() {
        await elementWatcher.exists('skill-page .header > .name:contains("Loot")');

        const lootCard = $('skill-page .header > .name:contains("Loot")').closest('.card');
        if (!lootCard.length) {
            return;
        }
        const itemWrapper = $('<div/>').addClass('itemWrapper').attr('id', 'itemWrapper')
        if(backgroundUrl) {
            itemWrapper.css("background-image", 'linear-gradient(0deg, rgba(0, 0, 0, 0) 66%, rgba(13, 34, 52, 1) 100%), url(' + backgroundUrl + ')');
        } else {
            itemWrapper.addClass('lineAboveCanvas');
        }
        lootCard.append(itemWrapper);

        killswitch = setInterval(() => {
            const itemWrapper = $('#itemWrapper');
            if (!itemWrapper.length) {
                reset();
            }
        }, 1000);

        const matterContainer = document.querySelector('#itemWrapper');
        //console.log(matterContainer);

        const actualWidth = matterContainer.clientWidth + 2;
        const actualheigth = matterContainer.clientHeight + 2;

        engine = Engine.create();
        render = Render.create({
            element: matterContainer,
            engine: engine,
            options: {
                width: actualWidth,
                height: actualheigth,
                background: 'transparent',
                wireframes: false,
            },
        });

        var ground = Bodies.rectangle(
            actualWidth / 2,
            actualheigth + THICCNESS / 2,
            27184,
            THICCNESS,
            { isStatic: true }
        );

        let leftWall = Bodies.rectangle(
            0 - THICCNESS / 2,
            actualheigth / 2,
            THICCNESS,
            actualheigth * 10,
            { isStatic: true }
        );

        let rightWall = Bodies.rectangle(
            actualWidth + THICCNESS / 2,
            actualheigth / 2,
            THICCNESS,
            actualheigth * 10,
            { isStatic: true }
        );

        Composite.add(engine.world, [ground, leftWall, rightWall]);

        let mouse = Matter.Mouse.create(render.canvas);
        let mouseConstraint = Matter.MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: {
                    visible: false,
                },
            },
        });

        Composite.add(engine.world, mouseConstraint);

        mouseConstraint.mouse.element.removeEventListener(
            'mousewheel',
            mouseConstraint.mouse.mousewheel
        );
        mouseConstraint.mouse.element.removeEventListener(
            'DOMMouseScroll',
            mouseConstraint.mouse.mousewheel
        );
        // Matter.Events.on(mouseConstraint, 'mousemove', function (event) {
        //     var foundPhysics = Matter.Query.point(items.map(i => i.ref), event.mouse.position);

        //     console.log(foundPhysics[0]);
        // });

        Render.run(render);

        var runner = Runner.create();

        Runner.run(runner, engine);

        function handleResize(matterContainer) {
            const actualWidth = matterContainer.clientWidth + 2;
            const actualheigth = matterContainer.clientHeight + 2;

            render.canvas.width = actualWidth;
            render.canvas.height = actualheigth;

            Matter.Body.setPosition(
                ground,
                Matter.Vector.create(actualWidth / 2, actualheigth + THICCNESS / 2)
            );

            Matter.Body.setPosition(
                rightWall,
                Matter.Vector.create(actualWidth + THICCNESS / 2, actualheigth / 2)
            );
        }

        window.addEventListener('resize', () => handleResize(matterContainer));
    }

    function reset() {
        //console.log('reset');
        if (render) {
            Render.stop(render);
            World.clear(engine.world);
            Engine.clear(engine);
            render.canvas?.remove();
            render.canvas = null;
            render.context = null;
            render.textures = {};
        }
        if (killswitch) {
            clearInterval(killswitch);
            killswitch = undefined;
        }
        $('#itemWrapper').remove();
        lastLoot = {};
        items = [];
    }

    function addItem(itemId, amount = 1) {
        const initialDensity = 1;
        const previousItemState = [...items];

        for (let i = 0; i < amount; i++) {
            const newItem = { id: itemId, density: initialDensity, ref: undefined };
            items.push(newItem);
        }

        var clumpingOccurred;
        do {
            clumpingOccurred = false;
            const distinctPairs = Array.from(
                items.reduce((set, item) => {
                    const pair = JSON.stringify({ id: item.id, density: item.density });
                    set.add(pair);
                    return set;
                }, new Set())
            ).map((pair) => JSON.parse(pair));

            distinctPairs.forEach((p) => {
                const itemsWithIdAndDensity = items.filter(
                    (i) => i.id === p.id && i.density == p.density
                );

                if (itemsWithIdAndDensity.length < max_same_density) {
                    return;
                }

                clumpingOccurred = true;

                const itemsToClump = itemsWithIdAndDensity.slice(0, clumpsize);

                items = items.filter((item) => !itemsToClump.includes(item));

                const newItem = { id: itemId, density: p.density * clumpsize, ref: undefined };
                items.push(newItem);
            });
        } while (clumpingOccurred);

        const removed = previousItemState.filter((prevItem) => !items.includes(prevItem));
        removed.forEach((removedItem) => {
            if (removedItem.ref) cullItem(removedItem);
        });

        const added = items.filter((currItem) => !previousItemState.includes(currItem));
        added.forEach((addedItem) => {
            spawnItem(addedItem);
        });
    }

    function cullItem(item) {
        World.remove(engine.world, item.ref);
    }

    function spawnItem(item) {
        const gameItem = itemCache.byId[item.id];

        const matterContainer = document.querySelector('#itemWrapper');
        const spread = randomIntFromInterval(-50, 50) + matterContainer.clientWidth / 2;

        const itemSize = DESIRED_IMAGESIZE + logBase(item.density, clumpsize) * (DESIRED_IMAGESIZE * (imagesize_increase - 1));
        const imageScale = itemSize / DESIRED_IMAGESIZE;
        const scaleCorrection = DESIRED_IMAGESIZE / ORIGINAL_IMAGESIZE;

        const itemObject = Bodies.circle(spread, 50, itemSize / 2, {
            friction: 0.3,
            frictionAir: 0.00001,
            restitution: 0.5, // bouncyness
            render: {
                sprite: {
                    texture: 'assets/' + gameItem.image,
                    xScale: scaleCorrection * imageScale,
                    yScale: scaleCorrection * imageScale,
                },
            },
        });
        World.add(engine.world, itemObject);
        item.ref = itemObject;
        //console.log(`spawning ${item.id} with density ${item.density}`);
    }

    async function ensureImagesLoaded(action) {
        const itemIds = dropCache.byAction[action].map((d) => d.item);
        for (const itemId of itemIds) {
            await loadImage(itemId)
        }
    }

    async function loadImage(itemId) {
        const item = itemCache.byId[itemId];
        if(!item) return;
        if(loadedImages.includes(itemId)) {
            //console.log(`Already have image for ${item.name} (${item.id})`);
            return;
        }
        await new Promise((res, rej) => {
            let img = new Image();
            img.onload = () => {
                loadedImages.push(itemId);
                //console.log(`Successfully loaded image for ${item.name} (${item.id})`);
                res();
            };
            img.onerror = rej;
            img.src = 'assets/' + item.image;
        });
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
    }

    function randomIntFromInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    function logBase(n, base) {
        return Math.log(n) / Math.log(base);
    }

    function objDelta(obj1, obj2) {
        const delta = {};

        for (const key in obj1) {
            if (obj1.hasOwnProperty(key)) {
                delta[key] = obj2[key] - obj1[key];
            }
        }

        for (const key in obj2) {
            if (obj2.hasOwnProperty(key) && !obj1.hasOwnProperty(key)) {
                delta[key] = obj2[key];
            }
        }

        return delta;
    }

    //background-position: center center;
    const styles = `
		.itemWrapper {
			width: 100%;
			height: 350px;
			background-color: transparent;
            overflow: hidden;
            position: relative;
            border-radius: 0px 0px 4px 4px;

            background-size: cover;
            background-repeat: no-repeat;

            canvas {
                border-radius: 0 0 4px 4px;
                margin: -1px;
            }
		}
        .noPad_InheritHeigth {
            padding: 0px !important;
            height: inherit !important;
            color: #aaa;
        }
        .lineAboveCanvas {
            border-top: 1px solid #263849
        }
	`;

    initialise();
}
