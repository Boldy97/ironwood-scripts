(() => {

    if(window.moduleRegistry) {
        return;
    }

    window.moduleRegistry = {
        add,
        get,
        build
    };

    const modules = {};

    function add(name, initialiser) {
        modules[name] = createModule(name, initialiser);
    }

    function get(name) {
        return modules[name] || null;
    }

    function build() {
        createTree();
        loadLeafModules();
    }

    function createTree() {
        for(const module of Object.values(modules)) {
            for(const dependency of module.dependencies) {
                dependency.module = modules[dependency.name];
                if(!dependency.module && !dependency.optional) {
                    throw `Unresolved dependency : ${dependency.name}`;
                }
                dependency.module.dependents.push(module);
            }
        }
    }

    function loadLeafModules() {
        for(const module of Object.values(modules)) {
            if(!isMissingDependencies(module)) {
                buildModule(module);
            }
        }
    }

    function createModule(name, initialiser) {
        const dependencies = extractParametersFromFunction(initialiser).map(dependency => ({
                name: dependency.replaceAll('_', ''),
                optional: dependency.startsWith('_'),
                module: null
            }));
        return {
            name,
            initialiser,
            dependencies,
            dependents: []
        };
    }

    async function buildModule(module, chain = []) {
        if(module.built) {
            return;
        }
        if(isMissingDependencies(module)) {
            return;
        }

        if(chain.includes(module.name)) {
            chain.unshift(module.name);
            throw `Circular dependency in chain : ${chain.join(' -> ')}`;
        }
        chain.unshift(module.name);

        const parameters = module.dependencies.map(a => a.module?.reference);
        try {
            module.reference = await module.initialiser.apply(null, parameters);
        } catch(e) {
            console.error(`Failed building ${module.name}`, e);
            return;
        }
        module.built = true;

        for(const dependent of module.dependents) {
            buildModule(dependent, structuredClone(chain));
        }
    }

    function extractParametersFromFunction(fn) {
        const PARAMETER_NAMES = /([^\s,]+)/g;
        var fnStr = fn.toString();
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(PARAMETER_NAMES);
        return result || [];
    }

    function isMissingDependencies(module) {
        for(const dependency of module.dependencies) {
            if(dependency.optional && dependency.module && !dependency.module.built) {
                return true;
            }
            if(!dependency.optional && !dependency.module.built) {
                return true;
            }
        }
        return false;
    }

})();
