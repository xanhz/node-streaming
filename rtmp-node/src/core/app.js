const _ = require('lodash');
const { Logger } = require('./logger');
const { AppContext } = require('./context');
const { isRunnable, isStoppable, toStringToken } = require('./utils');

class MediaApplication {
  constructor() {
    this.logger = new Logger('MediaApplication');
  }

  register(providers) {
    for (const provider of providers) {
      const { provide, inject = [], useValue, useFactory } = provider;
      const token = toStringToken(provide);

      if (useValue) {
        AppContext.providers.set(token, useValue);
        continue;
      }

      if (useFactory) {
        const args = inject.map(o => {
          const instance = AppContext.providers.get(toStringToken(o));
          if (_.isNil(instance)) {
            throw new Error(`Missing ${toStringToken(o)} when creating ${token}`);
          }
          return instance;
        });
        AppContext.providers.set(token, useFactory(...args));
        continue;
      }

      throw new Error('Missing useValue of useFactory in provider');
    }
  }

  async run() {
    for (const [name, provider] of AppContext.providers.entries()) {
      if (isRunnable(provider)) {
        this.logger.info('Starting %s...', name);
        await provider.run();
        this.logger.info('%s is started', name);
      }
    }
  }

  async stop() {
    for (const [name, provider] of AppContext.providers.entries()) {
      if (isStoppable(provider)) {
        this.logger.info('Stopping %s...', name);
        await provider.stop();
        this.logger.info('%s is stopped', name);
      }
    }
  }

  on(event, listener) {
    AppContext.on(event, listener);
  }
}

module.exports = { MediaApplication };
