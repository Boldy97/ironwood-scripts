() => {

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

    function buildModule(module, chain) {
        if(module.built) {
            return;
        }

        chain = chain || [];
        if(chain.includes(module.name)) {
            chain.push(module.name);
            throw `Circular dependency in chain : ${chain.join(' -> ')}`;
        }
        chain.push(module.name);

        for(const dependency of module.dependencies) {
            if(!dependency.module) {
                if(dependency.optional) {
                    break;
                }
                throw `Unresolved dependency : ${dependency.name}`;
            }
            buildModule(dependency.module, chain);
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        module.reference = module.initialiser.apply(null, parameters);
        module.built = true;

        chain.pop();
    }

    function extractParametersFromFunction(fn) {
        const PARAMETER_NAMES = /([^\s,]+)/g;
        var fnStr = fn.toString();
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(PARAMETER_NAMES);
        return result || [];
    }

}
