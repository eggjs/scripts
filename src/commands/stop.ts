import { debuglog, format } from 'node:util';
import { scheduler } from 'node:timers/promises';
import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../baseCommand.js';
import { isWindows, findNodeProcess, NodeProcess, kill } from '../helper.js';

const debug = debuglog('@eggjs/scripts/commands/stop');

const osRelated = {
  titleTemplate: isWindows ? '\\"title\\":\\"%s\\"' : '"title":"%s"',
  // node_modules/@eggjs/cluster/dist/commonjs/app_worker.js
  // node_modules/@eggjs/cluster/dist/esm/app_worker.js
  appWorkerPath: /@eggjs[\/\\]cluster[\/\\]dist[\/\\](commonjs|esm)[\/\\]app_worker\.js/i,
  // node_modules/@eggjs/cluster/dist/commonjs/agent_worker.js
  // node_modules/@eggjs/cluster/dist/esm/agent_worker.js
  agentWorkerPath: /@eggjs[\/\\]cluster[\/\\]dist[\/\\](commonjs|esm)[\/\\]agent_worker\.js/i,
};

export default class Stop<T extends typeof Stop> extends BaseCommand<T> {
  static override description = 'Stop server';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override args = {
    baseDir: Args.string({
      description: 'directory of application',
      required: false,
    }),
  };

  static override flags = {
    title: Flags.string({
      description: 'process title description, use for kill grep',
    }),
    timeout: Flags.integer({
      description: 'the maximum timeout(ms) when app stop',
      default: 5000,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = this;

    this.log(`stopping egg application${flags.title ? ` with --title=${flags.title}` : ''}`);

    // node ~/eggjs/scripts/scripts/start-cluster.cjs {"title":"egg-server","workers":4,"port":7001,"baseDir":"~/eggjs/test/showcase","framework":"~/eggjs/test/showcase/node_modules/egg"}
    let processList = await this.findNodeProcesses(item => {
      const cmd = item.cmd;
      const matched = flags.title ?
        cmd.includes('start-cluster') && cmd.includes(format(osRelated.titleTemplate, flags.title)) :
        cmd.includes('start-cluster');
      if (matched) {
        debug('find master process: %o', item);
      }
      return matched;
    });
    let pids = processList.map(x => x.pid);

    if (pids.length) {
      this.log('got master pid %j', pids);
      this.killProcesses(pids);
      // wait for 5s to confirm whether any worker process did not kill by master
      await scheduler.wait(flags.timeout);
    } else {
      this.logToStderr('can\'t detect any running egg process');
    }

    // node --debug-port=5856 /Users/tz/Workspaces/eggjs/test/showcase/node_modules/_egg-cluster@1.8.0@egg-cluster/lib/agent_worker.js {"framework":"/Users/tz/Workspaces/eggjs/test/showcase/node_modules/egg","baseDir":"/Users/tz/Workspaces/eggjs/test/showcase","port":7001,"workers":2,"plugins":null,"https":false,"key":"","cert":"","title":"egg-server","clusterPort":52406}
    // node /Users/tz/Workspaces/eggjs/test/showcase/node_modules/_egg-cluster@1.8.0@egg-cluster/lib/app_worker.js {"framework":"/Users/tz/Workspaces/eggjs/test/showcase/node_modules/egg","baseDir":"/Users/tz/Workspaces/eggjs/test/showcase","port":7001,"workers":2,"plugins":null,"https":false,"key":"","cert":"","title":"egg-server","clusterPort":52406}
    // ~/bin/node --no-deprecation --trace-warnings ~/eggjs/examples/helloworld/node_modules/@eggjs/cluster/dist/commonjs/agent_worker.js {"baseDir":"~/eggjs/examples/helloworld","startMode":"process","framework":"~/eggjs/examples/helloworld/node_modules/egg","title":"egg-server-helloworld","workers":10,"clusterPort":58977}
    processList = await this.findNodeProcesses(item => {
      const cmd = item.cmd;
      const matched = flags.title ?
        (osRelated.appWorkerPath.test(cmd) || osRelated.agentWorkerPath.test(cmd)) && cmd.includes(format(osRelated.titleTemplate, flags.title)) :
        (osRelated.appWorkerPath.test(cmd) || osRelated.agentWorkerPath.test(cmd));
      if (matched) {
        debug('find app/agent worker process: %o', item);
      }
      return matched;
    });
    pids = processList.map(x => x.pid);

    if (pids.length) {
      this.log('got worker/agent pids %j that is not killed by master', pids);
      this.killProcesses(pids);
    }

    this.log('stopped');
  }

  protected async findNodeProcesses(filter: (item: NodeProcess) => boolean): Promise<NodeProcess[]> {
    return findNodeProcess(filter);
  }

  protected killProcesses(pids: number[], signal: NodeJS.Signals = 'SIGTERM') {
    kill(pids, signal);
  }
}
