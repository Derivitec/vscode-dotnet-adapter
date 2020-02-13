type PromiseResolver = (value?: void | PromiseLike<void> | undefined) => void;

type PromiseRejecter = (reason?: any) => void;

interface QueueCount extends Array<number> {
    readonly total: number,
}

export default class QueueManager<T extends { [K in keyof T]: K extends string ? number : string }> {
    public currentJob?: Slot<T>;

    private readonly jobQueues: Slot<T>[][];

    private readonly killswitches: PromiseRejecter[] = [];

    constructor(private readonly priority: (T extends number ? number : never)[]) {
        this.jobQueues = Array(priority.length).fill(null).map(() => []);
    }

    private get jobs() {
        const inQueue = this.jobQueues.reduce((acc, queue) => acc + queue.length, 0);
        return this.isRunning ? inQueue + 1 : inQueue;
    }

    public get isRunning() {
        return this.currentJob instanceof Slot;
    }

    public get count() {
        const queueLengths = this.jobQueues.map(arr => arr.length) as QueueCount;
        Object.assign(queueLengths, {
            total: this.jobs,
        });
        return queueLengths;
    }

    public async acquireSlot(op: T) {
        if (typeof op !== 'number') throw '[QueueManager] Provide a number or enum key.';
        const slot = new Slot(op);
        if (this.jobs > 0) {
            this.jobQueues[op].push(slot);
            this.killswitches.push(slot.cancel);
            await slot.activation;
        }
        this.currentJob = slot;
        return () => this.triggerNextJob();
    }

    public retractSlots(op?: T) {
        let count = 0;
        const cancelAll = (arr: Slot<T>[]) => {
            arr.forEach(slot => slot.cancel());
            arr.length = 0;
        }
        if (typeof op !== 'number') {
            count = this.jobs;
            this.jobQueues.forEach(cancelAll);
            this.triggerNextJob();
            return count;
        }
        count = this.jobQueues[op].length + Number(this.isRunning);
        cancelAll(this.jobQueues[op]);
        if (this.currentJob && this.currentJob.type === op) this.triggerNextJob();
        return count;
    }

    public dispose() {
        this.killswitches.forEach(killswitch => killswitch('[QueueManager] Queue disposed'));
    }

    private triggerNextJob() {
        this.currentJob = undefined;
        if (this.jobs > 0) {
            // Find the first queue in order of priority that has jobs
            let nextQueueId = this.priority.find(i => this.jobQueues[i].length > 0);
            // If an id isn't found but we have jobs on the queue, our state is corrupt.
            if (typeof nextQueueId !== 'number') throw '[QueueManager] Jobs left on the queue are inaccessible.';
            const next = this.jobQueues[nextQueueId].shift();
            if (!(next instanceof Slot)) {
                // Something has intereferred with the queues(?), our state is corrupt.
                this.retractSlots(); // Cancel everything on the queue to hopefully flush this problem out
                throw '[QueueManager] Unexpected job object found.';
            }
            next.run();
        }
    }
}

class Slot<T> {
    public readonly type: T;

    public readonly activation: Promise<void>;

    public readonly run: PromiseResolver;

    public readonly cancel: PromiseRejecter;

    constructor(
        type: T
    ) {
        let resolve!: PromiseResolver;
        let reject!: PromiseRejecter;
        this.activation = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this.type = type;
        this.run = resolve;
        this.cancel = reject;
    }
}