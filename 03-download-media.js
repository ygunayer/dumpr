#!/usr/bin/env node
require('module-alias/register');

const path = require('path');
const util = require('util');
const request = require('request');
const ProgressBar = require('ascii-progress');
const {interpolate} = require('@dumpr/utils');
const {EventEmitter} = require('events');

const posts = (() => {
    const posts = require(process.argv[2] || './output/posts');
    return posts.reduce((acc, post) => { acc[post.id] = post; return acc; }, {});
})();
const mkdirp = (() => {
    const mkdirp = require('mkdirp');
    return util.promisify(mkdirp).bind(mkdirp);
})();
const fs = (() => {
    const fs = require('fs');
    return {
        open: util.promisify(fs.open).bind(fs),
        utimes: util.promisify(fs.utimes).bind(fs),
        writeFile: util.promisify(fs.writeFile).bind(fs),
        stat: util.promisify(fs.stat).bind(fs),
        createWriteStream: fs.createWriteStream.bind(fs)
    };
})();

const mediaList = require(process.argv[3] || './output/medias');
const downloadRoot = path.resolve(process.argv[4] || './output/downloads');
const filenamePattern = process.argv[5] || '${post.tumblelog.name}/${media.type}/${post.id}-${media.seq}${media.ext}';

function getMediaType(ext) {
    if (['.jpg', '.png', '.gif'].indexOf(ext) >= 0) {
        return 'image';
    }
    if (ext == '.mp4') {
        return 'video';
    }
    return 'misc';
}

function leftPad3(n) {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return n.toString();
}

function parseItems({postId, media}) {
    const post = posts[postId];
    if (!post) {
        throw new Error(`Post ${postId} not found`);
    }

    return media.map((url, i) => {
        const matches = /([\w\d\s\-_\+\=]+)\.?([\w\d]*)$/.exec(url);
        if (!matches) {
            throw new Error(`Invalid URL ${url}`);
        }
        const filename = matches[1]
        const ext = matches[2] ? `.${matches[2]}` : null;
        const type = getMediaType(ext);
        const seq = leftPad3(i);

        return {
            post,
            media: {
                seq,
                type: post.type,
                url,
                filename,
                ext
            }
        };
    });
}

async function beginDownload({from, destination, timestamp}, {overwrite = true} = {}) {
    const fullPath = path.join(destination.dir, destination.base);
    await mkdirp(destination.dir);

    const emitter = new EventEmitter();

    emitter.go = () => process.nextTick(async () => {
        try {
            await fs.stat(fullPath);
            if (!overwrite) {
                emitter.emit('end');
                return;
            }
        } catch (err) {
            if (err.code != 'ENOENT') {
                emitter.emit('error', err);
                return;
            }
        }

        const ws = fs.createWriteStream(fullPath);

        request
            .get(from)
            .on('response', response => {
                if (response.statusCode == 200) {
                    emitter.emit('length-discovered', +response.headers['content-length']);
                } else if (response.code >= 400) {
                    emitter.emit('error', new Error(`Response code ${response.code}`));
                }
            })
            .on('data', chunk => emitter.emit('tick', chunk.length))
            .on('end', async () => {
                await fs.utimes(fullPath, Date.now() / 1000, timestamp);
                emitter.emit('end');
            })
            .on('error', e => emitter.emit('error', e))
            .pipe(ws)
            .on('error', e => emitter.emit('error', e));
    });

    return emitter;
}

const downloadList = mediaList
    .map(parseItems)
    .reduce((acc, data) => acc.concat(data), [])
    .map(data => {
        const fullPath = path.join(downloadRoot, interpolate(filenamePattern, data));
        return {
            id: Math.random().toString().slice(2),
            timestamp: data.post['unix-timestamp'],
            from: data.media.url,
            destination: path.parse(fullPath)
        }
    });

    //console.log(JSON.stringify(downloadList, null, 4))

async function downloadBulk(items, {parallelism = 8, retryCount = 2, overwrite = false} = {}) {
    let queue = [].concat(items);

    const state = {};

    const rootBar = new ProgressBar({
        schema: `   [:bar] :percent\t:etas\t:current/:total`,
        total: items.length,
        width: 20
    });

    rootBar.update(0);

    const downloader = async (idx) => {
        const bar = new ProgressBar({
            schema: '',
            total: 0,
            width: 20
        });

        let item;

        const onLengthDiscovered = length => bar.total = length;
        const onTick = bytes => bar.tick(bytes, {refresh: true});

        while (item = queue.pop()) {
            let attempts = 0;
            try {
                bar.setSchema(`${idx + 1}. [:bar] :percent\t:etas\t${item.destination.base}`);
                bar.update(0);
            } catch (err) {

            }

            let itemState = state[item.id] = {item, status: 'downloading'};

            while (true) {
                bar.total = 0;

                const shouldBreak = await new Promise(async resolve => {
                    let emitter = await beginDownload(item, {overwrite});
                    emitter.once('length-discovered', onLengthDiscovered);
                    emitter.on('tick', onTick);
                    emitter.on('end', () => {
                        itemState.status = 'complete';
                        resolve(true);
                    });
                    emitter.on('error', err => {
                        attempts++;

                        if (attempts >= retryCount) {
                            itemState.status = 'error';
                            itemState.error = err;
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });

                    emitter.go();
                });

                if (shouldBreak) {
                    rootBar.tick();
                    break;
                }
            }
        }
    };

    setInterval(async () => {
        await fs.writeFile('/Users/ygunayer/Developer/personal/dumpr/output/state.json', JSON.stringify(state, null, 4), 'utf8');
    }, 2000);

    const downloaders = new Array(parallelism).fill(0).map((_, idx) => downloader(idx));

    return Promise.all(downloaders);
}

downloadBulk(downloadList)
    .then(() => console.log('Done'))
    .catch(err => console.error(err));
