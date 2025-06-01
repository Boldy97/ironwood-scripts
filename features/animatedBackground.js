(configuration, events, elementCreator, elementWatcher, itemCache, util, assetUtil) => {

    let enabled = false;
    let animation = null;
    let animationType = 'falling';
    let allGameItems = undefined;

    const MAX_AMOUNT = 300;
    const DEFAULT_AMOUNT = 100;
    const MIN_AMOUNT = 1;

    const MAX_FPS = 120;
    const DEFAULT_FPS = 70;
    const MIN_FPS = 30;

    let maxItems = DEFAULT_AMOUNT;
    let targetFPS = DEFAULT_FPS;

    const falling_baseItemSize = 48;
    const falling_minScale = 0.5;
    const falling_maxScale = 1.5;
    const falling_fallSpeedScaleFactor = 1.1;
    const falling_fallSpeedBase = 0.1;
    const falling_blurFactor = 2;
    const falling_baseBlur = 0.5;
    const falling_rotationSpeedFactor = 0.03

    const grid_itemSize = 48;
    const grid_minLifetime = 5000;
    const grid_maxLifetime = 15000;
    const grid_fadeDuration = 1000;

    let customImageUrl = '';
    let onlyCustomItem = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Animated Background',
            key: 'animated-background',
            name: 'Animated Background Enabled',
            default: false,
            handler: handleConfigStateChange
        });
        configuration.registerInput({
            category: 'Animated Background',
            key: 'animated-background-max-item-count',
            name: `Amount`,
            default: DEFAULT_AMOUNT,
            inputType: 'number',
            text: 'Amount of items on screen [Falling]',
            light: true,
            noHeader: true,
            handler: handleConfigMaxItemCountChange,
        });
        configuration.registerInput({
            category: 'Animated Background',
            key: 'animated-background-fps',
            name: `[${MIN_FPS} - ${MAX_FPS}]`,
            default: DEFAULT_FPS,
            inputType: 'number',
            text: 'Desired FPS (performance)',
            light: true,
            noHeader: true,
            handler: handleConfigFpsChange,
        });
        configuration.registerInput({
            category: 'Animated Background',
            key: 'animated-background-custom-image',
            name: `png, jpeg, jpg, svg`,
            default: customImageUrl,
            inputType: 'text',
            text: 'Custom image URL',
            light: true,
            noHeader: true,
            layout: '2/5',
            handler: handleConfigCustomItemChange,
        });
        configuration.registerCheckbox({
            category: 'Animated Background',
            key: 'animated-background-custom-image-only',
            name: 'Only Custom image',
            default: onlyCustomItem,
            handler: handleConfigOnlyCustomItemChange
        });
        configuration.registerDropdown({
            category: 'Animated Background',
            key: 'animated-background-type',
            name: 'Animation type',
            default: animationType,
            noHeader: true,
            compact: true,
            layout: '5/1',
            options: ['Falling', 'Grid'],
            handler: handleConfigAnimationTypeChange
        });
        elementCreator.addStyles(styles);
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }

    function handleConfigMaxItemCountChange(state) {
        if (!state || state === '') {
            maxItems = DEFAULT_AMOUNT;
            return;
        }
        if (state < MIN_AMOUNT) {
            maxItems = MIN_AMOUNT;
            return;
        }
        if (state > MAX_AMOUNT) {
            maxItems = MAX_AMOUNT;
            return;
        }
        maxItems = state;

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }

    function handleConfigFpsChange(state) {
        if (!state || state === '') {
            targetFPS = DEFAULT_FPS;
            return;
        }
        if (state < MIN_FPS) {
            targetFPS = MIN_FPS;
            return;
        }
        if (state > MAX_FPS) {
            targetFPS = MAX_FPS;
            return;
        }
        targetFPS = state;

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }

    function handleConfigCustomItemChange(state) {
        if (typeof state !== 'string' || state.trim() === '') {
            customImageUrl = '';
            return;
        }

        const imageUrlPattern = /\.(jpeg|jpg|png|svg)$/i;
        if (!imageUrlPattern.test(state.trim())) {
            customImageUrl = '';
            return;
        }

        customImageUrl = state.trim();

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }

    function handleConfigOnlyCustomItemChange(state) {
        onlyCustomItem = state;

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }

    function handleConfigAnimationTypeChange(state) {
        animationType = state;

        removeAnimatedBackground();
        handlePage(events.getLast('page'));
    }


    function handlePage(page) {
        if (!page) return;
        const disabledPages = ['rules', 'terms', 'privacy'];
        if (!enabled || disabledPages.includes(page.type)) {
            removeAnimatedBackground();
        } else {
            addAnimatedBackground();
        }
    }

    function getRandomItem() {
        if (onlyCustomItem) {
            return { imageUrl: customImageUrl, special: true };
        }

        const specialImageUrls = [
            'https://images.icon-icons.com/881/PNG/512/Pancake_icon-icons.com_68716.png',
            'https://ironwoodrpg.com/assets/characters/character.png'
        ];

        const specialItems = specialImageUrls.map(url => ({
            imageUrl: url,
            special: true
        }));

        if (customImageUrl !== '') {
            specialItems.push({
                imageUrl: customImageUrl.trim(),
                special: true
            });
        }

        if (!allGameItems) {
            allGameItems = itemCache.list.filter(i => i.id > 0);
        }

        const combinedItems = [...allGameItems, ...specialItems];
        const randomItemIndex = util.randomIntFromInterval(1, combinedItems.length - 1);
        const randomItem = combinedItems[randomItemIndex];
        if (!randomItem) console.log(`itemindex ${randomItemIndex} is ${randomItem}`);
        return randomItem;
    }

    function stopAnimatedBackground() {
        if (animation) {
            animation.destroy();
            animation = null;
        }
    }

    function startFallingItems(canvas) {
        const ctx = canvas.getContext('2d');
        const fallingItems = [];
        let animationFrameId;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        class FallingItem {
            constructor() {
                this.needsReset = false;
                this.scale = falling_minScale + Math.random() * (falling_maxScale - falling_minScale);
            }

            async init() {
                await this.reset(true);
            }

            async reset(randomY = false) {
                const item = getRandomItem();

                let img;
                if (item.special) {
                    img = await assetUtil.loadImageFromUrl(item.imageUrl);
                } else {
                    img = await assetUtil.loadItemImage(item.id);
                }

                this.itemId = item.id;
                this.img = img;
                this.size = falling_baseItemSize * this.scale;
                this.x = Math.random() * canvas.width;
                this.y = randomY ? Math.random() * canvas.height : -this.size;
                this.speedY = falling_fallSpeedBase + this.scale * falling_fallSpeedScaleFactor;
                this.rotation = Math.random() * Math.PI * 2;
                this.rotationSpeed = (Math.random() - 0.5) * falling_rotationSpeedFactor;
                this.needsReset = false;

                const dynamicBlur = (1 - (this.scale - falling_minScale) / (falling_maxScale - falling_minScale)) * falling_blurFactor;
                const blurAmount = falling_baseBlur + dynamicBlur;

                const offCanvas = document.createElement('canvas');
                offCanvas.width = this.size;
                offCanvas.height = this.size;

                const offCtx = offCanvas.getContext('2d');
                offCtx.filter = `blur(${blurAmount}px)`;

                try {
                    offCtx.drawImage(this.img, 0, 0, this.size, this.size);
                } catch (error) { }

                this.blurredCanvas = offCanvas;

                return true;
            }

            update() {
                // fallspeed ~ fps
                // fck deltatime

                this.y += this.speedY;
                this.rotation += this.rotationSpeed;

                if (this.y > canvas.height + this.size && !this.needsReset) {
                    this.needsReset = true;
                    queueReset(this);
                }
            }

            draw(ctx) {
                if (!this.blurredCanvas) return;

                try {
                    ctx.save();
                    ctx.translate(this.x, this.y);
                    ctx.rotate(this.rotation);
                    ctx.drawImage(this.blurredCanvas, -this.size / 2, -this.size / 2);
                    ctx.restore();
                } catch (error) { }
            }
        }

        const resetQueue = [];
        function queueReset(item) {
            resetQueue.push(item);
        }

        let resetqueuetimeout;
        function processResetQueue() {
            const maxPerFrame = 2;
            for (let i = 0; i < maxPerFrame && resetQueue.length; i++) {
                const item = resetQueue.shift();
                item.reset(false);
            }
            resetqueuetimeout = setTimeout(processResetQueue, 100);
        }
        processResetQueue();

        async function spawnItem() {
            const newItem = new FallingItem();
            await newItem.init();
            fallingItems.push(newItem);
        }

        async function initItems() {
            while (fallingItems.length < maxItems) {
                await spawnItem();
            }
            fallingItems.sort((a, b) => a.scale - b.scale);
        }

        let lastFrameTime = 0;
        const frameDuration = 1000 / targetFPS;
        function animate(timestamp) {
            if (timestamp - lastFrameTime >= frameDuration) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                for (let i = 0; i < fallingItems.length; i++) {
                    const item = fallingItems[i];
                    item.update();
                    item.draw(ctx);
                }

                lastFrameTime = timestamp;
            }

            animationFrameId = requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resizeCanvas);
        initItems().then(animate);

        function destroy() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('resize', resizeCanvas);
            clearTimeout(resetqueuetimeout);
        }

        return { destroy };
    }

    function startGridItems(canvas) {
        const ctx = canvas.getContext('2d');

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initGrid();
        }

        let cols, rows;
        let offsetX, offsetY;
        let grid = [];

        function initGrid() {
            cols = Math.ceil(canvas.width / grid_itemSize) + 2;
            rows = Math.ceil(canvas.height / grid_itemSize) + 2;
            offsetX = -(cols * grid_itemSize - canvas.width) / 2;
            offsetY = -(rows * grid_itemSize - canvas.height) / 2;

            grid = [];
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    grid.push(createGridCell(x, y));
                }
            }
        }

        function createGridCell(gridX, gridY) {
            return {
                x: gridX * grid_itemSize + offsetX,
                y: gridY * grid_itemSize + offsetY,
                img: null,
                lifetime: 0,
                lifetimeMax: 0,
                fade: 0,
                fadingOut: false,
                fadingIn: true,
            };
        }

        async function loadNewImage(cell) {
            const item = getRandomItem();
            if (item.special) {
                cell.img = await assetUtil.loadImageFromUrl(item.imageUrl);
            } else {
                cell.img = await assetUtil.loadItemImage(item.id);
            }
        }

        async function resetCell(cell) {
            cell.lifetimeMax = grid_minLifetime + Math.random() * (grid_maxLifetime - grid_minLifetime);
            cell.lifetime = 0;
            cell.fadingOut = false;
            cell.fadingIn = true;
            cell.fade = 0;
            await loadNewImage(cell);
        }

        async function initGridAsync() {
            for (const cell of grid) {
                cell.lifetimeMax = grid_minLifetime + Math.random() * (grid_maxLifetime - grid_minLifetime);
                cell.lifetime = Math.random() * cell.lifetimeMax;

                await loadNewImage(cell);

                const progress = cell.lifetime / cell.lifetimeMax;

                if (progress < 0.5) {
                    cell.fadingIn = true;
                    cell.fadingOut = false;
                    cell.fade = progress * 2;
                } else {
                    cell.fadingIn = false;
                    cell.fadingOut = false;
                    cell.fade = 1;
                }
            }
        }

        let lastTime = 0;

        function animate(time = 0) {
            const delta = time - lastTime;
            lastTime = time;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            grid.forEach(cell => {
                cell.lifetime += delta;

                if (!cell.fadingOut && cell.lifetime >= cell.lifetimeMax) {
                    cell.fadingOut = true;
                    cell.fadingIn = false;
                }

                if (cell.fadingOut) {
                    cell.fade -= delta / grid_fadeDuration;
                    if (cell.fade <= 0) {
                        cell.fade = 0;
                        cell.fadingOut = false;
                        resetCell(cell);
                    }
                } else if (cell.fadingIn) {
                    cell.fade += delta / grid_fadeDuration;
                    if (cell.fade >= 1) {
                        cell.fade = 1;
                        cell.fadingIn = false;
                    }
                }

                if (cell.img && cell.fade > 0) {
                    ctx.save();
                    ctx.globalAlpha = cell.fade;
                    ctx.drawImage(cell.img, cell.x, cell.y, grid_itemSize, grid_itemSize);
                    ctx.restore();
                }
            });

            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resizeCanvas);

        initGrid();
        initGridAsync().then(() => requestAnimationFrame(animate));

        function destroy() {
            window.removeEventListener('resize', resizeCanvas);
        }

        return { destroy };
    }

    async function addAnimatedBackground() {
        await elementWatcher.exists('nav-component');
        if ($('.animatedBackgroundCanvas').length === 0) {
            const $canvas = $('<canvas class="animatedBackgroundCanvas"></canvas>');
            $('snow-component').css('display', 'none');
            $('nav-component').after($canvas);
            stopAnimatedBackground();

            switch (animationType) {
                case 'Grid':
                    animation = startGridItems($canvas[0]);
                    break;
                case 'Falling':
                default:
                    animation = startFallingItems($canvas[0]);
                    break;
            }
        }
    }

    function removeAnimatedBackground() {
        stopAnimatedBackground();
        $('.animatedBackgroundCanvas').remove();
        $('snow-component').css('display', '');
    }

    const styles = `
        .animatedBackgroundCanvas {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            pointer-events: none;
        }
    `;

    initialise();

}
