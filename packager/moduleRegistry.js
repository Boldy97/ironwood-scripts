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
        detectCircularDependencies();
        loadLeafModules();
    }

    function createTree() {
        for(const module of Object.values(modules)) {
            for(const dependency of module.dependencies) {
                dependency.module = modules[dependency.name];
                if(!dependency.module) {
                    if(dependency.optional) {
                        continue;
                    }
                    throw `Unresolved dependency : ${dependency.name}`;
                }
                dependency.module.dependents.push(module);
            }
        }
    }

    function detectCircularDependencies() {
        const visited = new Set();
        for(const module of Object.values(modules)) {
            let chain = visit(module, visited);
            if(chain) {
                chain = chain.slice(chain.indexOf(chain.at(-1)));
                chain = chain.join(' -> ');
                console.error(`Circular dependency in chain : ${chain}`);
                return;
            }
        }
    }

    function visit(module, visited, stack = []) {
        if(!module) {
            return;
        }
        if(stack.includes(module.name)) {
            stack.push(module.name);
            return stack;
        }
        if(visited.has(module.name)) {
            return;
        }
        stack.push(module.name);
        for(const dependency of module.dependencies) {
            const subresult = visit(dependency.module, visited, stack);
            if(subresult) {
                return subresult;
            }
        }
        stack.pop();
        visited.add(module.name);
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

    async function buildModule(module) {
        if(module.built) {
            return;
        }
        if(isMissingDependencies(module)) {
            return;
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        try {
            module.reference = await module.initialiser.apply(null, parameters);
        } catch(e) {
            console.error(`Failed building ${module.name}`, e);
            return;
        }
        module.built = true;

        for(const dependent of module.dependents) {
            buildModule(dependent);
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
