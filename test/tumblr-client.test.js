require('module-alias/register');
require('mocha');

const path = require('path');
const util = require('util');
const fs = (() => {
    const fs = require('fs');
    return {
        readFile: util.promisify(fs.readFile).bind(fs)
    };
})();

const {expect} = require('chai');

const TumblrClient = require('@dumpr/lib/tumblr-client');

describe('TumblrClient', async () => {
    describe('parseSearchResponse', async () => {
        it('should parse correctly', async () => {
            const input = await fs.readFile(path.join(__dirname, '/data/response1.txt'), 'utf8');
            const actual = await TumblrClient.parseSearchResponse(input);
            const expected = require('./data/response1.json');

            expect(actual).to.deep.equal(expected);
        });
    });
});
