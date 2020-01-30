const toString36 = (num: number) => num.toString(36).substr(2);

const getUid = () => toString36(Math.random()) + toString36(Date.now());

const createConfigItem = <T>({ default: defaultVal, ...optional }: Partial<ConfigEntry<T>>) => ({
    typecheck: (data: any) => typeof data === typeof defaultVal,
    default: defaultVal,
    ...optional
}) as ConfigEntry<T>;

const plural = (count: number) => count !== 1 ? 's' : '';

export {
    getUid,
    createConfigItem,
    plural,
}