(util, elementCreator, elementWatcher) => {

    let _modal = null;

    const exports = {
        create,
        close
    };

    function initialise() {
        elementCreator.addStyles(styles);
    }


    async function create(config) {
        await elementWatcher.exists('app-component');

        close();

        const width = Math.max(200, Math.min(Number(config.maxWidth) || 450, 800));
        if (!config.title) throw new Error('Modal requires a title');
        const title = config.title;
        const image = config.image ?? 'https://ironwoodrpg.com/assets/misc/smelting.png';

        const modalId = util.generateRandomId();

        _modal = $(`
            <div class="custom-modal custom-route-nav">
            <div class="custom-modal-backdrop"></div>
            <div class="custom-modal-wrapper" style="max-width: ${width}px;">
                <div class="custom-modal-container">
                <div class="custom-modal-preview" id="${modalId}">
                    <div class="custom-modal-header">
                        <div class="custom-modal-image">
                            <img src="${image}" alt="Skill Icon">
                        </div>
                        <div class="custom-modal-name">${title}</div>
                        <button type="button" class="custom-modal-close">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                </div>
            </div>
            </div>
        `);

        _modal.find('.custom-modal-close, .custom-modal-backdrop').on('click', close);

        //  > .scroll > .padding > .wrapper // location of real modals
        $('app-component').append(_modal);

        return modalId;
    }

    function close() {
        if (_modal) {
            _modal.remove();
            _modal = null;
        }
    }

    const styles = `
        .custom-modal {
            position: fixed;
            inset: 0;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;

            .customComponent {
                margin-top: unset !important;
            }
        }
        .custom-modal-backdrop {
            position: absolute;
            inset: 0;
            background-color: #00000080;
        }
        .custom-modal-wrapper {
            max-width: 450px;
            margin: 0 auto;
            width: 100%;
            padding: var(--gap);
            overflow-y: auto;
            z-index: 1;
        }
        .custom-modal-container {
            position: relative;
            background-color: var(--darker-color);
            box-shadow: 0 6px 12px -6px #0006;
            border-radius: 4px;
        }
        .custom-modal-preview {
            background: var(--background-color);
            border-radius: 4px;
            box-shadow: 0 6px 12px -6px #0006;
        }
        .custom-modal-header {
            display: flex;
            align-items: center;
            padding: 12px var(--gap);

            .custom-modal-image {
                width: 32px;
                height: 32px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .custom-modal-name {
                margin-left: var(--margin);
                flex: 1;
                font-weight: 600;
                letter-spacing: .25px;
            }
        }
        
    `;

    initialise();

    return exports;
}
