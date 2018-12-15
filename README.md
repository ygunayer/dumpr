# dumpr
Yet another Tumblr downloader. Does its best to download all kinds of media, including Instagram videos and images.

> **Warning**: Most components of this project are incomplete, so completeness and robustness are not guaranteed.

## Configuration
dumpr uses [puppeteer-core](https://github.com/GoogleChrome/puppeteer) to discover Instagram media, which requires a Chromium-based browser to be installed on your machine. If you do not have one, use [puppeteer](https://github.com/GoogleChrome/puppeteer) instead, which downloads its own Chromium (over 170 MB).

Use the `CHROMIUM_PATH` environment variable to set the Chromium path.

## Running
dumpr runs in 3 phases: discover posts -> discover downloadable media -> download the media. The first two phases build their own databases which are reset when the corresponding step is re-run, so be careful.

To download everything from scratch, run the scripts in sequence:

```bash
$ node 01-discover-posts.js <blogName> [dbPath(default: ./output/posts.json)]
$ node 02-generate-download-list.js [postsDbPath(default: ./output/posts.json)] [mediasDbPath(default: ./output/medias.json)]
$ node 03-download-media.js [postsDbPath(default: ./output/posts.json)] [mediasDbPath(default: ./output/medias.json)] [downloadPath(default: ./output/downloads)]
```

## License
MIT
