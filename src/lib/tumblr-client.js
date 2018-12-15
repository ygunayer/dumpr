require('module-alias/register');

const util = require('util');
const {inBrowserDo, loadWithoutBrowser} = require('@dumpr/utils');

const request = (() => {
    const request = require('request');
    return util.promisify(request).bind(request);
})();

class TumblrClient {
    constructor({blogName, jar = null}) {
        this.blogName = blogName;
        this.jar = jar;
    }

    async makeRequest(path, {method = 'GET', qs = {}, headers = {}, json = false}, opts = {}) {
        const options = Object.assign({}, {
            url: `https://${this.blogName}.tumblr.com${path}`,
            headers: Object.assign({}, TumblrClient.defaultHeaders, headers),
            qs,
            method,
            json,
            jar: this.jar
        }, opts);

        return request(options);
    }

    async search({start = null} = {}) {
        return this.makeRequest('/api/read/json', {qs: {start}})
            .then(({body = ''} = {}) => TumblrClient.parseSearchResponse(body));
    }
}

TumblrClient.parseSearchResponse = async body => {
    if (!body) {
        return body;
    }

    return JSON.parse(body.trim().replace(/^\s*var\s+tumblr_api_read\s+\=\s+/, '').replace(/\;$/g, ''));
};

async function extractInstagramMedia(str) {
    const matches = /instagram\.com\/p\/(\w+)/.exec(str);
    if (!matches) {
        return [];
    }

    const postId = matches[1];
    const embedUrl = `https://instagram.com/p/${postId}/embed`;

    const {videoUrl, imageUrl} = await inBrowserDo(embedUrl, async ({page, browser}) => {
        await page.waitForSelector('.EmbeddedMedia');
        return await page.evaluate(() => {
            const video = document.querySelector('.EmbedVideo video');
            const image = document.querySelector('.EmbeddedMediaImage');
            return {
                videoUrl: video && video.src,
                imageUrl: image && image.src
            };
        });
    });

    //const dom = new JSDOM(body, {runScripts: 'dangerously'});
    if (videoUrl) {
        return [videoUrl];
    }

    if (imageUrl) {
        return [imageUrl];
    }

    return [ ];
}

async function extractFlickrMedia(str) {
    const window = loadWithoutBrowser(str);
    const linkElem = window.document.querySelector('a[data-flickr-embed]');
    const href = linkElem && linkElem.attributes.href;
    return href ? [href] : [];
}

function findVideos(html) {
    const window = loadWithoutBrowser(html);
    const videos = Array.prototype.slice.call(window.document.querySelectorAll('video'));
    return videos.map(video => {
        const source = video.querySelector(`source[type='video/mp4']`);
        return source ? source.src : video.src;
    }).filter(src => !!src);
}

TumblrClient.getMediaList = async post => {
    switch (post.type) {
        case 'photo': {
            let photos = post.photos;

            if (photos.length < 1) {
                photos = photos.concat(post);
            }

            const photoKeys = [1280, 500, 400, 250, 100, 75].map(k => `photo-url-${k}`);

            return photos.reduce((acc, item) => {
                const firstKey = photoKeys.filter(post.hasOwnProperty.bind(post))[0];
                if (firstKey) {
                    return acc.concat(item[firstKey]);
                }

                return acc;
            }, []);
        };

        case 'video': {
            const source = post['video-source'];
            if (!source) {
                return [];
            }

            if (source.indexOf('instagram.com') >= 0) {
                return extractInstagramMedia(source);
            }

            if (source.indexOf('flickr.com') >= 0) {
                return extractFlickrMedia(source);
            }

            const player = post['video-player'];

            if (!player) {
                return [];
            }

            return findVideos(player);
        }

        case 'regular': {
            const body = post['regular-body'];

            if (!body) {
                return [];
            }

            const videos = findVideos(body);

            if (videos.length < 1) {
                const window = loadWithoutBrowser(body);
                const images = Array.prototype.slice.call(window.document.querySelectorAll('blockquote img'));
                return images.map(img => img.src).filter(src => !!src);
            }

            return videos;
        }

        default: {
            throw new Error(`Unknown post type ${post}`);
        }
    }
};

TumblrClient.defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:63.0) Gecko/20100101 Firefox/63.0',
    'Content-Type': 'application/json'
};

module.exports = TumblrClient;
