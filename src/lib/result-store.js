const util = require('util');
const fs = (() => {
    const fs = require('fs');
    return {
        readFile: util.promisify(fs.readFile).bind(fs),
        writeFile: util.promisify(fs.writeFile).bind(fs),
        appendFile: util.promisify(fs.appendFile).bind(fs),
        createWriteStream: fs.createWriteStream.bind(fs)
    };
})();

class ResultStore {
    constructor({filename, throttleCount = 10, throttleTime = 3000}) {
        this.filename = filename;
        this.throttleCount = throttleCount;
        this.throttleTime = throttleTime;

        this._buf = [];
        this._isFirstWrite = true;
        this._attempts = 0;
    }

    shouldFlush() {
        const now = +Date.now();
        return (now - this._lastWrite) >= this.throttleTime || this._attempts >= this.throttleCount;
    }

    async open() {
        await fs.writeFile(this.filename, '', 'utf8');
        this._ws = fs.createWriteStream(this.filename, {
            encoding: 'utf8'
        });
        this._ws.write('[');
    }

    async close() {
        await this.flush();
        this._ws.write('\n]');
        return new Promise((resolve, reject) => {
            this._ws.end(e => {

                this._ws = null;

                if (e) {
                    return reject(e);
                }

                resolve();
            });
        });
    }

    async flush() {
        if (this._buf.length < 0) {
            return;
        }

        this._attempts++;

        if (!this.shouldFlush()) {
            await this.flush();
        }

        this._attempts = 0;

        this._buf.forEach(item => {
            this._ws.write((this._isFirstWrite ? '' : ',') + '\n');
            this._isFirstWrite = false;
            this._ws.write(JSON.stringify(item, null, 4));
        });

        this._lastWrite = +Date.now();

        this._buf = [];
    }

    async pushMany(items = []) {
        items.forEach(item => this._buf.push(item));
        await this.flush();
    }
}

module.exports = ResultStore;
