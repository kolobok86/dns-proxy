const path = require('path');
const fs = require('fs');
const functions = require('./functions');


const CONFIG_FILE_PATH = path.resolve('./config.json');

// ToDo on config change, fire custom event that could be processed in index.js
// ToDo handle cases when saved config has an error

// ToDo should module export configProvider function by default,
// or should it be object having method getInstance and containing other
// useful properties, like custom event types?

function Module () {
    // config remains constant object, thus can be assigned safely to outer variable.
    // Inner config properties are subject to be re-assigned on config.json change,
    // so should be accessed only as config[property].
    // In other words, you can do:
    //      const conf = config;
    // and conf data will be updated when config updates, but avoid doing
    //      const requestsToForge = config.requestsToForge;
    // as after config updates, requestsToForge will remain outdated.
    const config = {};
    Object.defineProperty(this, 'config', {
        get() {
            return config;
        },
        enumerable: true
    })

    this.initConfig = async function() {
        const fileContents = await readConfigFile(CONFIG_FILE_PATH);

        console.log('initConfig:');
        console.log(fileContents);
        console.log('fileContents logged ^^ ' + new Date().toUTCString());

        const parsedConfigData = parseConfig(fileContents);

        if (parsedConfigData.requestsToForge) {
            // prepare RegExps for matching host names, and store them in the config
            parsedConfigData.requestsToForge.forEach(request => {
                request.hostNamePattern = functions.makeRegexOfPattern(request.hostName);
            });
        }

        Object.assign(config, parsedConfigData);
    };

    async function readConfigFile(configPath) {
        const promise = new Promise((resolve, reject) => {
            fs.readFile(configPath, { encoding: 'utf8', flag: 'r' }, (err, data) => {
                if (err) {
                    console.log('readConfigFile err to throw');
                    throw err;
                }

                resolve(data);
            });
        })
        .then( fileContents => { return fileContents; } )
        .catch(err => { console.log('readConfigFile error: ', err); });

        return promise;
    }   // readConfigFile

    function parseConfig(fileContents) {
        const configData = JSON.parse(fileContents);
        return configData;
    }   // parseConfig


    // Update config, when config file is edited and saved.
    // on Windows, fs.watch is fired twice on file change, so to prevent race reading the file,
    // use configReadInProgress flag
    let configReadInProgress = false;

    fs.watch(CONFIG_FILE_PATH, async () => {
        if(!configReadInProgress) {
            configReadInProgress = true;
            console.log('===== config changed, run initConfig() =====');

            try {
                await this.initConfig();
            } catch (err) {
                console.log('===== error initConfig(), skip =====,', err);
                configReadInProgress = false;
            }

            configReadInProgress = false;
        }
        else {
            console.log('===== config changed, initConfig() already running, skip =====');
        }
    });
}

let instance;

async function getInstance() {
    if(!instance) {
        instance = new Module();
        // Object.freeze(instance);
        await instance.initConfig();
    }

    return instance;
}

// or should it be exports.getInstance = getInstance; instead?
module.exports = getInstance;
