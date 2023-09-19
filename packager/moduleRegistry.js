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
        buildModule(modules[name], true);
    }

    function get(name) {
        return modules[name] || null;
    }

    function build() {
        for(const module of Object.values(modules)) {
            buildModule(module);
        }
    }

    function createModule(name, initialiser) {
        const dependencies = extractParametersFromFunction(initialiser).map(dependency => {
            const name = dependency.replaceAll('_', '');
            const module = get(name);
            const optional = dependency.startsWith('_');
            return { name, module, optional };
        });
        const module = {
            name,
            initialiser,
            dependencies
        };
        for(const other of Object.values(modules)) {
            for(const dependency of other.dependencies) {
                if(dependency.name === name) {
                    dependency.module = module;
                }
            }
        }
        return module;
    }

    function buildModule(module, partial, chain) {
        if(module.built) {
            return true;
        }

        chain = chain || [];
        if(chain.includes(module.name)) {
            chain.push(module.name);
            throw `Circular dependency in chain : ${chain.join(' -> ')}`;
        }
        chain.push(module.name);

        for(const dependency of module.dependencies) {
            if(!dependency.module) {
                if(partial) {
                    return false;
                }
                if(dependency.optional) {
                    continue;
                }
                throw `Unresolved dependency : ${dependency.name}`;
            }
            const built = buildModule(dependency.module, partial, chain);
            if(!built) {
                return false;
            }
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        module.reference = module.initialiser.apply(null, parameters);
        module.built = true;

        chain.pop();
        return true;
    }

    function extractParametersFromFunction(fn) {
        const PARAMETER_NAMES = /([^\s,]+)/g;
        var fnStr = fn.toString();
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(PARAMETER_NAMES);
        return result || [];
    }

})();
