() => {

    class Distribution {

        #map = new Map();

        constructor(initial) {
            if(initial) {
                this.add(initial, 1);
            }
        }

        add(value, probability) {
            if(this.#map.has(value)) {
                this.#map.set(value, this.#map.get(value) + probability);
            } else {
                this.#map.set(value, probability);
            }
        }

        addDistribution(other, weight) {
            other.#map.forEach((probability, value) => {
                this.add(value, probability * weight);
            });
        }

        convolution(other, multiplier) {
            const old = this.#map;
            this.#map = new Map();
            old.forEach((probability, value) => {
                other.#map.forEach((probability2, value2) => {
                    this.add(multiplier(value, value2), probability * probability2);
                });
            });
        }

        convolutionWithGenerator(generator, multiplier) {
            const result = new Distribution();
            this.#map.forEach((probability, value) => {
                const other = generator(value);
                other.#map.forEach((probability2, value2) => {
                    result.add(multiplier(value, value2), probability * probability2);
                });
            });
            return result;
        }

        count() {
            return this.#map.size;
        }

        average() {
            let result = 0;
            this.#map.forEach((probability, value) => {
                result += value * probability;
            });
            return result;
        }

        sum() {
            let result = 0;
            this.#map.forEach(probability => {
                result += probability;
            });
            return result;
        }

        min() {
            return Array.from(this.#map, ([k, v]) => k).reduce((a,b) => Math.min(a,b), Infinity);
        }

        max() {
            return Array.from(this.#map, ([k, v]) => k).reduce((a,b) => Math.max(a,b), -Infinity);
        }

        variance() {
            let result = 0;
            const average = this.average();
            this.#map.forEach((probability, value) => {
                const dist = average - value;
                result += dist * dist * probability;
            });
            return result;
        }

        normalize() {
            const sum = this.sum();
            this.#map = new Map(Array.from(this.#map, ([k, v]) => [k, v / sum]));
        }

        expectedRollsUntill(limit) {
            const x = (this.count() - 1) / 2.0;
            const y = x * (x + 1) * (2 * x + 1) / 6;
            const z = 2*y / this.variance();
            const average = this.average();
            const a = y + average * (average - 1) * z / 2;
            const b = z * average * average;
            return limit / average + a / b;
        }

        clone() {
            const result = new Distribution();
            result.#map = new Map(this.#map);
            return result;
        }

        getLeftTail(rolls, cutoff) {
            const mean = rolls * this.average();
            const variance = rolls * this.variance();
            const stdev = Math.sqrt(variance);
            return Distribution.cdf(cutoff, mean, stdev);
        }

        getRightTail(rolls, cutoff) {
            return 1 - this.getLeftTail(rolls, cutoff);
        }

        getRange(rolls, left, right) {
            return 1 - this.getLeftTail(rolls, left) - this.getRightTail(rolls, right);
        }

        getMeanLeftTail(rolls, cutoff) {
            return this.getMeanRange(rolls, -Infinity, cutoff);
        }

        getMeanRightTail(rolls, cutoff) {
            return this.getMeanRange(rolls, cutoff, Infinity);
        }

        getMeanRange(rolls, left, right) {
            const mean = rolls * this.average();
            const variance = rolls * this.variance();
            const stdev = Math.sqrt(variance);
            const alpha = (left - mean) / stdev;
            const beta = (right - mean) / stdev;
            const c = Distribution.pdf(beta) - Distribution.pdf(alpha);
            const d = Distribution.cdf(beta, 0, 1) - Distribution.cdf(alpha, 0, 1);
            if(!c || !d) {
                return (left + right) / 2;
            }
            return mean - stdev * c / d;
        }

        toChart(other) {
            if(other) {
                const min = Math.min(this.min(), other.min());
                const max = Math.max(this.max(), other.max());
                for(let i=min;i<=max;i++) {
                    if(!this.#map.has(i)) {
                        this.#map.set(i, 0);
                    }
                }
            }
            const result = Array.from(this.#map, ([k, v]) => ({x:k,y:v}));
            result.sort((a,b) => a.x - b.x);
            return result;
        }

        redistribute(value, exceptions) {
            // redistributes this single value across all others, except the exceptions
            const probability = this.#map.get(value);
            if(!probability) {
                return;
            }
            this.#map.delete(value);

            let sum = 0;
            this.#map.forEach((p, v) => {
                if(!exceptions.includes(v)) {
                    sum += p;
                }
            });
            this.#map.forEach((p, v) => {
                if(!exceptions.includes(v)) {
                    this.#map.set(v, p + probability*p/sum);
                }
            });
        }

    };

    Distribution.getRandomChance = function(probability) {
        const result = new Distribution();
        result.add(true, probability);
        result.add(false, 1-probability);
        return result;
    };

    // probability density function -> probability mass function
    Distribution.getRandomOutcomeFloored = function(min, max) {
        const result = new Distribution();
        const rangeMult = 1 / (max - min);
        for(let value=Math.floor(min); value<max; value++) {
            let lower = value;
            let upper = value + 1;
            if(lower < min) {
                lower = min;
            }
            if(upper > max) {
                upper = max;
            }
            result.add(value, (upper - lower) * rangeMult);
        }
        return result;
    };

    Distribution.getRandomOutcomeRounded = function(min, max) {
        return Distribution.getRandomOutcomeFloored(min + 0.5, max + 0.5);
    }

    // Cumulative Distribution Function
    // https://stackoverflow.com/a/59217784
    Distribution.cdf = function(value, mean, std) {
        const z = (value - mean) / std;
        const t = 1 / (1 + .2315419 * Math.abs(z));
        const d =.3989423 * Math.exp( -z * z / 2);
        let prob = d * t * (.3193815 + t * ( -.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        if(z > 0 ) {
            prob = 1 - prob;
        }
        return prob
    };

    Distribution.pdf = function(zScore) {
        return (Math.E ** (-zScore*zScore/2)) / Math.sqrt(2 * Math.PI);
    };

    return Distribution;

}
