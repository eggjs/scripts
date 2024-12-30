'use strict';

const fs = require('fs');
const path = require('path');
const BaseCommand = require('common-bin');
const Logger = require('zlogger');
const helper = require('./helper');

class Command extends BaseCommand {
  constructor(rawArgv) {
    super(rawArgv);

    Object.assign(this.helper, helper);

    this.parserOptions = {
      removeAlias: true,
      removeCamelCase: true,
      execArgv: true,
    };

    // common-bin setter, don't care about override at sub class
    // https://github.com/node-modules/common-bin/blob/master/lib/command.js#L158
    this.options = {
      sourcemap: {
        description: 'whether enable sourcemap support, will load `source-map-support` etc',
        type: 'boolean',
        alias: [ 'ts', 'typescript' ],
      },

      require: {
        description: 'inject to execArgv --require',
        type: 'array',
        alias: 'r',
      },
    };

    this.logger = new Logger({
      prefix: '[egg-scripts] ',
      time: false,
    });
  }

  get context() {
    const context = super.context;
    const { argv, execArgvObj, cwd } = context;

    let baseDir = argv._[0] || cwd;
    if (!path.isAbsolute(baseDir)) baseDir = path.join(cwd, baseDir);
    const pkgFile = path.join(baseDir, 'package.json');
    if (fs.existsSync(pkgFile)) {
      const pkgInfo = require(pkgFile);
      const eggInfo = pkgInfo.egg;

      // read `eggScriptsConfig.require` from package.json
      const eggScriptsConfig = pkgInfo.eggScriptsConfig;
      let requireFiles = Array.isArray(argv.require) ? argv.require : [];
      if (eggScriptsConfig && Array.isArray(eggScriptsConfig.require)) {
        requireFiles = requireFiles.concat(eggScriptsConfig.require);
      }
      execArgvObj.require = execArgvObj.require || [];
      requireFiles
        .filter(injectScript => injectScript)
        .forEach(injectScript => {
          let requirePath = '';
          if (path.isAbsolute(injectScript) || injectScript.startsWith(`.${path.sep}`)) {
            requirePath = path.resolve(baseDir, injectScript);
          } else {
            requirePath = injectScript;
          }
          execArgvObj.require.push(requirePath);
        });

      // read argv from eggScriptsConfig in package.json
      if (eggScriptsConfig && typeof eggScriptsConfig === 'object') {
        for (const key in pkgInfo.eggScriptsConfig) {
          const v = pkgInfo.eggScriptsConfig[key];
          // like https://github.com/node-modules/common-bin/blob/master/lib/helper.js#L180
          if (key.startsWith('node-options--')) {
            const newKey = key.replace('node-options--', '');
            if (execArgvObj[newKey] == null) {
              execArgvObj[newKey] = v;
            }
          } else {
            if (argv[key] == null) {
              // only set if key is not pass from command line
              argv[key] = v;
            }
          }
        }
      }

      // read `egg.typescript` from package.json
      if (eggInfo && eggInfo.typescript && typeof argv.sourcemap === 'undefined') {
        argv.sourcemap = true;
      }

      delete argv.require;
    }

    // execArgv
    if (argv.sourcemap) {
      execArgvObj.require = execArgvObj.require || [];
      execArgvObj.require.push(require.resolve('source-map-support/register'));
    }

    argv.sourcemap = argv.typescript = argv.ts = undefined;

    return context;
  }

  exit(code) {
    process.exit(code);
  }
}

module.exports = Command;
