const toString36 = (num: number) => num.toString(36).substr(2);

const getUid = () => toString36(Math.random()) + toString36(Date.now());

export {
    getUid
}