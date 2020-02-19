import * as fs from 'fs';

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

const readFileAsync = (filePath: string, options?: object) => new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf8', ...options }, (err, data) => {
        if (err) return reject(err);
        resolve(data);
    });
});

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
    plural,
    objToListSentence,
    readFileAsync,
    getDate,
    getFileFromPath,
    getErrStr,
}