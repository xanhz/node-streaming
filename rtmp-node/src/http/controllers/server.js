const os = require('os');
const { AppContext } = require('../../core');

const cpuAverage = () => {
  // Initialize sum of idle and time of cores and fetch CPU info
  let totalIdle = 0,
    totalTick = 0,
    cpus = os.cpus();

  // Loop through CPU cores
  for (let i = 0, len = cpus.length; i < len; i++) {
    // Select CPU core
    const cpu = cpus[i];

    // Total up the time in the cores tick
    for (type in cpu.times) {
      totalTick += cpu.times[type];
    }

    // Total up the idle time of the core
    totalIdle += cpu.times.idle;
  }

  // Return the average Idle and Tick times
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
};

const percentageCPU = () => {
  return new Promise((resolve, _) => {
    let startMeasure = cpuAverage();
    setTimeout(() => {
      const endMeasure = cpuAverage();
      // Calculate the difference in idle and total time between the measures
      const idleDifference = endMeasure.idle - startMeasure.idle;
      const totalDifference = endMeasure.total - startMeasure.total;

      // Calculate the average percentage CPU usage
      const percentageCPU = 100 - ~~((100 * idleDifference) / totalDifference);
      resolve(percentageCPU);
    }, 100);
  });
};

const getSessionsInfo = () => {
  const info = {
    inbytes: 0,
    outbytes: 0,
    rtmp: 0,
  };

  for (const session of AppContext.sessions.values()) {
    info.inbytes += session.socket.bytesRead;
    info.outbytes += session.socket.bytesWritten;
    info.rtmp += 1;
  }

  return info;
};

const info = async (req, res) => {
  const sinfo = getSessionsInfo();
  const cpuload = await percentageCPU();
  return {
    version: '1.0.0',
    os: {
      arch: os.arch(),
      platform: os.platform(),
      release: os.release(),
    },
    cpu: {
      num: os.cpus().length,
      load: cpuload,
      model: os.cpus()[0].model,
      speed: os.cpus()[0].speed,
    },
    mem: {
      totle: os.totalmem(),
      free: os.freemem(),
    },
    net: {
      inbytes: AppContext.stats.inbytes + sinfo.inbytes,
      outbytes: AppContext.stats.outbytes + sinfo.outbytes,
    },
    nodejs: {
      uptime: Math.floor(process.uptime()),
      version: process.version,
      mem: process.memoryUsage(),
    },
    clients: {
      accepted: AppContext.stats.accepted,
      active: AppContext.sessions.size,
      rtmp: sinfo.rtmp,
    },
  };
};

module.exports = { info };
