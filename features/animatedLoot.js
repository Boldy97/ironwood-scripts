(events, elementWatcher, dropCache, itemCache) => {
    const THICCNESS = 60;

    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const World = Matter.World;
    const Composite = Matter.Composite;

    const CLUMPSIZE = 10;
    const MAX_SAME_DENSITY = 10;

    const ORIGINAL_IMAGESIZE = 32;
    const DESIRED_IMAGESIZE = 24;
    const IMAGESIZE_INCREASE = DESIRED_IMAGESIZE / 4;

    var engine;
    var render;
    var killswitch;

    var items = [];
    var lastLoot = {};

    const itemWrapper = $('<div/>').addClass('itemWrapper').attr('id', 'itemWrapper');

    async function initialise() {
        addStyles();
        events.register('page', handlePage);
        events.register('state-loot', handleLoot);

        window.itemsTest = {
            clearItems: clearItems,
            spawnitem: addItem,
            debug: debug,
        };
    }

    async function handlePage(page) {
        reset();

        if (page.type !== 'action') {
            return;
        }

        await ensureImagesLoaded(page.action);

        const initial = events.getLast('state-loot');
        handleLoot(initial);
    }

    async function handleLoot(lootState) {
        if(!lootState) return;
        const page = events.getLast('page');
        if (lootState.action !== page.action) return;

        const itemWrapper = $('#itemWrapper');
        if(!itemWrapper.length) {
            await createItemWrapper();
        }

        const delta = objDelta(lastLoot, lootState.loot);
        //console.log('handleLoot', delta);
        lastLoot = lootState.loot;

        for (const [id, val] of Object.entries(delta)) {
            if (val > 0) addItem(id, val);
        }
    }

    async function createItemWrapper() {
        await elementWatcher.exists('skill-page .header > .name:contains("Loot")');
        
        const lootCard = $('skill-page .header > .name:contains("Loot")')
            .closest('.card');
        if(!lootCard.length) {
            return;
        }
        lootCard.append(itemWrapper);

        killswitch = setInterval(() => {
            const itemWrapper = $('#itemWrapper');
            if(!itemWrapper.length) {
                reset();
            }
        },1000)

        const matterContainer = document.querySelector('#itemWrapper');
        console.log(matterContainer);

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
        engine.positionIterations = 10;
        engine.velocityIterations = 10;

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
                Matter.Vector.create(
                    actualWidth / 2,
                    actualheigth + THICCNESS / 2
                )
            );

            Matter.Body.setPosition(
                rightWall,
                Matter.Vector.create(
                    actualWidth + THICCNESS / 2,
                    actualheigth / 2
                )
            );
        }

        window.addEventListener('resize', () => handleResize(matterContainer));
    }

    function debug() {
        console.log(items);
    }                                                                     

    function clearItems() {
        console.log('clearItems', items);
        items.forEach((i) => {
            cullItem(i);
        });
        items = [];
    }

    function reset() {
        console.log('reset');
        if (render) {
            Render.stop(render);
            World.clear(engine.world);
            Engine.clear(engine);
            render.canvas?.remove();
            render.canvas = null;
            render.context = null;
            render.textures = {};
        }
        if(killswitch) {
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
            ).map(pair => JSON.parse(pair));

            distinctPairs.forEach(p => {
                const itemsWithIdAndDensity = items
                    .filter(i => i.id === p.id && i.density == p.density);
                
                if (itemsWithIdAndDensity.length < MAX_SAME_DENSITY) {
                    return;
                }

                clumpingOccurred = true;

                const itemsToClump = itemsWithIdAndDensity.slice(0, CLUMPSIZE)

                items = items.filter(item => !itemsToClump.includes(item));

                const newItem = { id: itemId, density: p.density * CLUMPSIZE, ref: undefined };
                items.push(newItem);
                
            });
        } while (clumpingOccurred);

        const removed = previousItemState.filter(prevItem => !items.includes(prevItem));
        removed.forEach(removedItem => {
            if (removedItem.ref) cullItem(removedItem);
        });

        const added = items.filter(currItem => !previousItemState.includes(currItem));
        added.forEach(addedItem => {
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

        const itemSize = DESIRED_IMAGESIZE + logBase(item.density, CLUMPSIZE) * IMAGESIZE_INCREASE;
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
        const items = itemIds.reduce((acc, i) => [...acc, itemCache.byId[i]], []);
        for (const item of items) {
            await new Promise((res, rej) => {
                let img = new Image();
                img.onload = () => {
                    console.log(`Successfully loaded image for ${item.name} (${item.id})`);
                    res();
                };
                img.onerror = rej;
                img.src = 'assets/' + item.image;
            });
        }
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

    const styles = `
		.itemWrapper {
			width: 100%;
			height: 350px;
			background-color: transparent;
            border-top: 1px solid #263849;
            overflow: hidden;
            position: relative;
            border-radius: 0px 0px 4px 4px;

            canvas {
                border-radius: 0 0 4px 4px;
                margin: -1px;
            }
		}
	`;

    initialise();
}
