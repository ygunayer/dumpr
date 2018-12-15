#!/usr/bin/env node
require('module-alias/register');

const TumblrClient = require('@dumpr/lib/tumblr-client');
const ResultStore = require('@dumpr/lib/result-store');

const {getActualPath} = require('@dumpr/utils');

const store = new ResultStore({filename: process.argv[3] || './output/medias.json'});
const inputData = require('./output/posts.json');

const getters = inputData
    .map(async post => {
        return {
            postId: post.id,
            media: await TumblrClient.getMediaList(post)
        };
    });

store.open()
    .then(() => Promise.all(getters))
    .then(items => store.pushMany(items))
    .then(() => store.close())
    .then(() => console.log('Done'))
    .catch(console.error.bind(console));  
