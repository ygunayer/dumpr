#!/usr/bin/env node
require('module-alias/register');

const ProgressBar = require('progress');
const {EventEmitter} = require('events');

const {delay, getActualPath} = require('@dumpr/utils');

const TumblrClient = require('@dumpr/lib/tumblr-client');
const ResultStore = require('@dumpr/lib/result-store');

const blogName = process.argv[2];
if (!blogName) {
    throw new Error(`No blog name specified`);
}

let dbPath = getActualPath(process.argv[3] || `./output/posts.json`);

const store = new ResultStore({filename: dbPath});
const client = new TumblrClient({blogName});

async function createCursor() {
    const emitter = new EventEmitter();

    emitter.start = () => {
        process.nextTick(async () => {
            let finished = false;
            let offset = 0;

            let total = -Infinity;
        
            while (!finished) {
                const result = await client.search({start: offset});
                emitter.emit('item', result);

                const newTotal = result['posts-total'];
                if (newTotal > total) {
                    emitter.emit('upper-limit-discovered', newTotal);
                    total = newTotal;
                }

                await delay(10);

                finished = result.posts.length < 1;
                offset += result.posts.length;
            }

            emitter.emit('end');
        });
    };

    return emitter;
}

createCursor()
    .then(async e => {
        let bar;
        await store.open();

        e.on('upper-limit-discovered', total => {
            if (!bar) {
                bar = new ProgressBar('[:bar] :current/:total (:percent) :rate/bps - :etas', {
                    total,
                    width: 30
                });
            }

            bar.total = total;
        })

        e.on('item', result => {
            bar && bar.tick(result.posts.length);
            store.pushMany(result.posts);
        });

        e.on('error', err => {
            console.error('An error has occurred while searching the blog.', err);
            process.exit(-1);
        });

        e.on('end', async () => {
            await store.close();
            console.info('Finished');
            process.exit(0);
        });

        e.start();

        return delay(Infinity);
    })
    .catch(console.error.bind(console));
