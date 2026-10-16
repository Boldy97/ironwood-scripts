(configuration, events, skillCache, skillSetCache, elementCreator) => {

    let enabled = false;
    let observer = null;

    function initialise() {
        elementCreator.addStyles(styles);
        configuration.registerCheckbox({
            category: 'Traits',
            key: 'trait-set-labels',
            name: 'Show Skill Set Labels',
            default: true,
            handler: state => {
                enabled = state;
                handlePage(events.getLast('page'));
            }
        });
        events.register('page', handlePage);
    }

    function handlePage(page) {
        if(observer) {
            observer.disconnect();
            observer = null;
        }
        if(!enabled || page?.type !== 'traits' || page?.menu !== 'traits') {
            cleanUp();
            return;
        }
        // Watch above the page so delayed rendering and replacement of the page
        // or its cards are handled as well as changes to individual rows.
        observer = new MutationObserver(updateLabels);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        updateLabels();
    }

    function updateLabels() {
        const labelledRows = new Set();
        const labelledValues = new Set();
        const equippedRows = new Set();
        document.querySelectorAll('traits-page .groups > * > .card').forEach(card => {
            const name = card.querySelector('.header > .name')?.textContent.trim();
            if(name !== 'Traits' && name !== 'Equipped') {
                return;
            }
            card.querySelectorAll('button.row').forEach(row => {
                const title = row.querySelector('.title')?.textContent.trim().toLowerCase();
                const level = row.querySelector('.level');
                const skill = skillCache.list.find(skill => title?.startsWith(`${skill.displayName.toLowerCase()} `));
                const sets = skill && ['Forest', 'Mountain', 'Ocean']
                    .map(name => skillSetCache.byName[name])
                    .filter(set => set?.skills.includes(skill.id));
                if(!level || !sets?.length) {
                    return;
                }
                labelledRows.add(row);
                const text = sets.length === 3 ? 'All Sets' : sets.map(set => set.name).join(' / ');
                let label = row.querySelector('.trait-set-label');
                if(!label) {
                    label = document.createElement('span');
                    label.className = 'trait-set-label';
                }
                // Idempotent writes let the observer settle, including when the
                // sort/filter feature reacts to an inserted label by moving rows.
                if(label.textContent !== text) {
                    label.textContent = text;
                }
                if(label.nextElementSibling !== level || label.parentNode !== level.parentNode) {
                    level.before(label);
                }
                // Direct hooks avoid depending on Safari invalidating sibling
                // selectors when a label is inserted during initial rendering.
                labelledValues.add(level);
                level.classList.add('trait-set-value');
                level.classList.toggle('trait-set-equipped-value', name === 'Equipped');
                row.classList.toggle('trait-set-equipped-row', name === 'Equipped');
                if(name === 'Equipped') {
                    equippedRows.add(row);
                }
            });
        });
        cleanUp(labelledRows, labelledValues, equippedRows);
    }

    function cleanUp(labelledRows = new Set(), labelledValues = new Set(), equippedRows = new Set()) {
        document.querySelectorAll('traits-page .trait-set-label').forEach(label => {
            if(!labelledRows.has(label.closest('button.row'))) {
                label.remove();
            }
        });
        document.querySelectorAll('traits-page .trait-set-value').forEach(value => {
            if(!labelledValues.has(value)) {
                value.classList.remove('trait-set-value', 'trait-set-equipped-value');
            }
        });
        document.querySelectorAll('traits-page .trait-set-equipped-row').forEach(row => {
            if(!equippedRows.has(row)) {
                row.classList.remove('trait-set-equipped-row');
            }
        });
    }

    const styles = `
        traits-page .trait-set-label {
            display: inline-block;
            flex: 0 0 4.5em;
            width: 4.5em;
            margin-inline: 0.5em;
            font-size: 0.8em;
            font-weight: normal;
            text-align: center;
            white-space: nowrap;
            opacity: 0.8;
            pointer-events: none;
        }
        traits-page .trait-set-value {
            flex: 0 0 4.5em !important;
            width: 4.5em !important;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        /* Equipped rows show changing XP in .level. Reserve its column so
           digit changes cannot push the set label sideways. Priority keeps
           later game flex rules from restoring content-based sizing. */
        traits-page .trait-set-equipped-value {
            flex-basis: 9em !important;
            width: 9em !important;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        @media (max-width: 600px) {
            traits-page .trait-set-label {
                margin-inline: 0.25em;
                font-size: 0.75em;
            }
            traits-page .trait-set-equipped-row {
                flex-wrap: wrap;
            }
            traits-page .trait-set-equipped-value {
                flex-basis: calc(100% - var(--margin)) !important;
                width: calc(100% - var(--margin)) !important;
            }
        }
    `;

    initialise();
}
