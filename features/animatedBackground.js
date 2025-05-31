(configuration, events, elementCreator, elementWatcher, itemCache, util, assetUtil) => {

    let enabled = false;

    let animation = null;

    const MAX_AMOUNT = 300;
    const DEFAULT_AMOUNT = 100;
    const MIN_AMOUNT = 1;

    const MAX_FPS = 120;
    const DEFAULT_FPS = 70;
    const MIN_FPS = 30;

    let maxItems = DEFAULT_AMOUNT;
    let targetFPS = DEFAULT_FPS;

    const baseItemSize = 48;
    const minScale = 0.5;
    const maxScale = 1.5;
    const fallSpeedScaleFactor = 1.1;
    const fallSpeedBase = 0.1;
    const blurFactor = 2;
    const baseBlur = 0.5;
    const rotationSpeedFactor = 0.03

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
            default: MAX_AMOUNT,
            inputType: 'number',
            text: 'Amount of falling items on screen',
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
            text: 'Custom Item URL',
            light: true,
            noHeader: true,
            layout: '1/3',
            handler: handleConfigCustomItemChange,
        });
        configuration.registerCheckbox({
            category: 'Animated Background',
            key: 'animated-background-custom-image-only',
            name: 'Only Custom Item',
            default: onlyCustomItem,
            handler: handleConfigOnlyCustomItemChange
        });
        elementCreator.addStyles(styles);
        events.register('page', handlePage);

        getRandomItem();
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

        specialItems.push({
            imageUrl: customImageUrl.trim(),
            special: true
        });

        const combinedItems = [...itemCache.list, ...specialItems];
        const randomItemIndex = util.randomIntFromInterval(0, combinedItems.length - 1);
        return combinedItems[randomItemIndex];
    }

    function stopFallingItems() {
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
                this.scale = minScale + Math.random() * (maxScale - minScale);
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
                this.size = baseItemSize * this.scale;
                this.x = Math.random() * canvas.width;
                this.y = randomY ? Math.random() * canvas.height : -this.size;
                this.speedY = fallSpeedBase + this.scale * fallSpeedScaleFactor;
                this.rotation = Math.random() * Math.PI * 2;
                this.rotationSpeed = (Math.random() - 0.5) * rotationSpeedFactor;
                this.needsReset = false;

                const dynamicBlur = (1 - (this.scale - minScale) / (maxScale - minScale)) * blurFactor;
                const blurAmount = baseBlur + dynamicBlur;

                const offCanvas = document.createElement('canvas');
                offCanvas.width = this.size;
                offCanvas.height = this.size;

                const offCtx = offCanvas.getContext('2d');
                offCtx.filter = `blur(${blurAmount}px)`;
                offCtx.drawImage(this.img, 0, 0, this.size, this.size);
                offCtx.filter = 'none';

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
                } catch (error) {
                    debugger;
                }
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

    async function addAnimatedBackground() {
        await elementWatcher.exists('nav-component');
        if ($('.animatedBackgroundCanvas').length === 0) {
            const $canvas = $('<canvas class="animatedBackgroundCanvas"></canvas>');
            $('snow-component').css('display', 'none');
            $('nav-component').after($canvas);
            stopFallingItems();
            animation = startFallingItems($canvas[0]);
        }
    }

    function removeAnimatedBackground() {
        stopFallingItems();
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
