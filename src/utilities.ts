import * as vscode from 'vscode';

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

const normaliseError = (err: any): { name: string, message: string } => {
    const unknownName = 'Unknown';
    const unknownMessage = 'An unknown error occurred';
    if (err instanceof Error) return err;
    if (err === null) return { name: 'NULL', message: 'A null value was returned' };
    if (typeof err === 'object' && (!('name' in err) || !('message' in err))) return Object.assign(err, { name: err.name || unknownName, message: err.message || unknownMessage });
    if (typeof err === 'object') return err;
    if (typeof err === 'string') return { name: err, message: err };
    return { name: unknownName, message: unknownMessage };
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
    normaliseError,
}