import * as fs from 'fs';

const toString36 = (num: number) => num.toString(36).substr(2);

const getUid = () => toString36(Math.random()) + toString36(Date.now());

const createConfigItem = <T>({ default: defaultVal, ...optional }: Partial<ConfigEntry<T>>) => ({
    typecheck: Array.isArray(defaultVal) ? Array.isArray : (data: any) => typeof data === typeof defaultVal,
    default: defaultVal,
    ...optional
}) as ConfigEntry<T>;

const combineGlobPatterns = (patterns: string[]) => patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`;

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
    Object.entries(obj).forEach(([key, value], i, arr) => {
        const needsJoiner = str.length > 0;
        const last = arr.length - 1 === i;
        const joiner = last ? ' and ' : ', ';
        if (value === 0 && ignoreZeros) return;
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

export {
    getUid,
    createConfigItem,
    combineGlobPatterns,
    plural,
    objToListSentence,
    readFileAsync,
    getDate,
}