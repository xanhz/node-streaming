const { PrismaClient } = require('@prisma/client');
const { Logger } = require('../core');

class PrismaService extends PrismaClient {
  /**
   * @param {string} url
   */
  constructor(url) {
    super({
      datasources: {
        db: {
          url,
        },
      },
    });
    this.logger = new Logger('PrismaService');
    this.$connect()
      .then(() => {
        this.logger.info('Connected on %s', url);
      })
      .catch(error => {
        this.logger.error(error);
        process.exit(1);
      });
  }
}

module.exports = { PrismaService };
