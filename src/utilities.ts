const toString36 = (num: number) => num.toString(36).substr(2);

const getUid = () => toString36(Math.random()) + toString36(Date.now());

const createConfigItem = <T>({ default: defaultVal, ...optional }: Partial<ConfigEntry<T>>) => ({
    typecheck: Array.isArray(defaultVal) ? Array.isArray : (data: any) => typeof data === typeof defaultVal,
    default: defaultVal,
    ...optional
}) as ConfigEntry<T>;

// We can combine glob patterns together, but we can't nest group conditions in vscode
const optimiseGlobPatterns = (patterns: string[]) => {
    if (patterns.every(pattern => pattern.indexOf('{') === -1)) return [`{${patterns.join(',')}}`];
    return patterns;
}

const getPatternArray = (patterns: SearchPatterns) => {
    let patternArray: string[] = [];
    if (typeof patterns === 'object' && !Array.isArray(patterns)) {
        patternArray = Object.values(patterns)
            .reduce((acc, val) => (acc as string[]).concat(val), []) as string[];
    } else if (typeof patterns === 'string') {
        patternArray = [patterns];
    } else if (Array.isArray(patterns)) {
        patternArray = patterns;
    }
    return optimiseGlobPatterns(patternArray);
}

const plurals = {
    '': 's',
    'is': 'are',
};
const plural = (count: number, word: keyof typeof plurals = '') => {
    const shouldPlural = count !== 1;
    if (word in plurals) return shouldPlural ? plurals[word] : word;
    return shouldPlural ? `${word}s` : word;
};

const objToListSentence = (obj: { [key: string]: number }, ignoreZeros = true) => {
    let str = '';
    let entries = Object.entries(obj);
    if (ignoreZeros) {
        entries = entries.filter(([key, value]) => value !== 0);
    }
    entries.forEach(([key, value], i, arr) => {
        const needsJoiner = str.length > 0;
        const last = arr.length - 1 === i;
        const joiner = last ? ' and ' : ', ';
        if (needsJoiner) str += joiner;
        str += `${value} ${key}`;
    });
    return str;
}

const getDate = () => new Date().toISOString();

const getFileFromPath = (path: string) => path.substr(path.lastIndexOf('/') + 1);

const getErrStr = (err: any) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return err.toString();
}

export {
    getUid,
    createConfigItem,
    optimiseGlobPatterns,
    getPatternArray,
    plural,
    objToListSentence,
    getDate,
    getFileFromPath,
    getErrStr,
}