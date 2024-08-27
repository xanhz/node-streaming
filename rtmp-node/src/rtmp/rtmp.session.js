/**
 * @typedef {import('net').Socket} Socket
 * @typedef {Object} AuthConfig
 * @prop {boolean?} play Apply auth for play a stream - Default `false`
 * @prop {boolean?} publish Apply auth for publish a stream - Default `false`
 *
 * @typedef {Object} RtmpSessionConfig
 * @prop {string} id
 * @prop {Socket} socket
 * @prop {AuthConfig?} auth
 * @prop {number?} chunk_size The output chunk size in byte - Default `128`
 * @prop {number?} ping Ping time in millisecond - Default `60000`
 * @prop {number?} ping_timeout Ping timeout in millisecond - Default `30000`
 * @prop {boolean?} gop Enable GOP cache for enhancing performance - Default `true`
 */
const { StreamStatus } = require('@prisma/client');
const _ = require('lodash');
const qs = require('querystring');
const { AMF, AV, Hash } = require('../utils');
const Handshake = require('./rtmp.handshake');
const {
  FourCC,
  HandshakeState,
  PacketType,
  StreamState,
  RtmpChannel,
  RtmpChunkType,
  RtmpPraseState,
  RtmpType,
  RTMP_CHUNK_SIZE,
  RTMP_HANDSHAKE_SIZE,
  RTMP_HEADER_SIZES,
  MAX_CHUNK_HEADER,
} = require('./rtmp.constants');
const { AppContext, Logger } = require('../core');
const { PrismaService } = require('../services');
const { RtmpPacket } = require('./rtmp.packet');

class RtmpSession {
  /**
   * @param {RtmpSessionConfig} config
   */
  constructor(config) {
    const { id, socket, auth = {}, chunk_size = 128, gop = false, ping = 60000, ping_timeout = 30000 } = config;
    this.id = id;
    this.auth = auth;
    this.socket = socket;

    this.handshake = {
      payload: Buffer.alloc(RTMP_HANDSHAKE_SIZE),
      state: HandshakeState.Uninitialized,
      bytes: 0,
    };

    this.parser = {
      buffer: Buffer.alloc(MAX_CHUNK_HEADER),
      state: RtmpPraseState.Init,
      bytes: 0,
      basicBytes: 0,
      packet: null,
    };

    this.inPackets = new Map();

    this.inChunkSize = RTMP_CHUNK_SIZE;
    this.outChunkSize = chunk_size;
    this.pingTime = ping;
    this.pingTimeout = ping_timeout;
    this.pingInterval = null;

    this.isStarting = false;
    this.isPublishing = false;
    this.isPlaying = false;
    this.isIdling = false;
    this.isPause = false;
    this.isReceiveAudio = true;
    this.isReceiveVideo = true;
    this.metadata = null;
    this.aacSequenceHeader = null;
    this.avcSequenceHeader = null;

    this.audio = {
      codec: 0,
      codecName: '',
      profileName: '',
      samplerate: 0,
      channels: 1,
    };

    this.video = {
      codec: 0,
      codecName: '',
      profileName: '',
      width: 0,
      height: 0,
      fps: 0,
      count: 0,
      level: 0,
    };

    this.bitrate = 0;
    this.ackSize = 0;
    this.inAckSize = 0;
    this.inLastAck = 0;

    this.app = '';
    this.streams = 0;
    this.startTimestamp = 0;

    this.play = {
      streamId: 0,
      streamPath: '',
      args: {},
    };

    this.publish = {
      streamId: 0,
      streamPath: '',
      args: {},
    };

    /** @type {Set<string>} */
    this.players = new Set();
    this.numPlayCache = 0;
    this.bitrateCache = {};

    /** @type {Set<Buffer>} */
    this.rtmpGopCacheQueue = gop ? new Set() : null;

    this.logger = new Logger({ name: 'RtmpSession', ID: this.id });
  }

  get isLocal() {
    const ip = this.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip == '::ffff:127.0.0.1';
  }

  get duration() {
    if (this.startTimestamp) {
      return Date.now() - this.startTimestamp;
    }
    return this.startTimestamp;
  }

  run() {
    this.socket.on('data', this.onSocketData.bind(this));
    this.socket.on('close', this.onSocketClose.bind(this));
    this.socket.on('error', this.onSocketError.bind(this));
    this.socket.on('timeout', this.onSocketTimeout.bind(this));
    this.socket.setTimeout(this.pingTimeout);
    this.isStarting = true;
  }

  stop() {
    this.logger.info('[PublishSession] Stopping current session');

    if (this.isStarting) {
      this.isStarting = false;

      if (this.play.streamId > 0) {
        this.onDeleteStream({ streamId: this.play.streamId });
      }

      if (this.publish.streamId > 0) {
        this.onDeleteStream({ streamId: this.publish.streamId });
      }

      if (this.pingInterval != null) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      this.logger.info('[PublishSession] Session is stopped');

      this.connectCmdObj.bytesWritten = this.socket.bytesWritten;
      this.connectCmdObj.bytesRead = this.socket.bytesRead;
      AppContext.emit('done-connect', this.id, this.connectCmdObj);

      AppContext.removeSession(this.id);
      this.socket.destroy();
    }
  }

  reject(reason = 'unknown reason') {
    this.logger.warn('Reject publishing a stream | Reason=%s', reason);
    this.stop();
  }

  flush() {
    this.numPlayCache > 0 && this.socket.uncork();
  }

  onSocketClose() {
    this.logger.info('Socket was closed');
    this.stop();
  }

  onSocketError(e) {
    this.logger.error(e);
    this.stop();
  }

  onSocketTimeout() {
    this.logger.warn('Socket is timeout so stop this session');
    this.stop();
  }

  /**
   * @param {Buffer} data
   */
  onSocketData(data) {
    let bytes = data.length;
    let p = 0;
    let n = 0;
    while (bytes > 0) {
      switch (this.handshake.state) {
        case HandshakeState.Uninitialized: {
          this.handshake.state = HandshakeState.VersionSent;
          this.handshake.bytes = 0;
          bytes -= 1;
          p += 1;
          break;
        }
        case HandshakeState.VersionSent: {
          n = RTMP_HANDSHAKE_SIZE - this.handshake.bytes;
          n = n <= bytes ? n : bytes;
          data.copy(this.handshake.payload, this.handshake.bytes, p, p + n);
          this.handshake.bytes += n;
          bytes -= n;
          p += n;
          if (this.handshake.bytes === RTMP_HANDSHAKE_SIZE) {
            this.handshake.state = HandshakeState.AckSent;
            this.handshake.bytes = 0;
            let s0s1s2 = Handshake.generateS0S1S2(this.handshake.payload);
            this.socket.write(s0s1s2);
          }
          break;
        }
        case HandshakeState.AckSent: {
          n = RTMP_HANDSHAKE_SIZE - this.handshake.bytes;
          n = n <= bytes ? n : bytes;
          data.copy(this.handshake.payload, this.handshake.bytes, p, n);
          this.handshake.bytes += n;
          bytes -= n;
          p += n;
          if (this.handshake.bytes === RTMP_HANDSHAKE_SIZE) {
            this.handshake.state = HandshakeState.Done;
            this.handshake.bytes = 0;
            this.handshake.payload = null;
          }
          break;
        }
        default: {
          return this.rtmpChunkRead(data, p, bytes);
        }
      }
    }
  }

  rtmpChunkRead(data, p, bytes) {
    let size = 0;
    let offset = 0;
    let extended_timestamp = 0;

    while (offset < bytes) {
      switch (this.parser.state) {
        case RtmpPraseState.Init: {
          this.parser.bytes = 1;
          this.parser.buffer[0] = data[p + offset++];
          if (0 === (this.parser.buffer[0] & 0x3f)) {
            this.parser.basicBytes = 2;
          } else if (1 === (this.parser.buffer[0] & 0x3f)) {
            this.parser.basicBytes = 3;
          } else {
            this.parser.basicBytes = 1;
          }
          this.parser.state = RtmpPraseState.BasicHeader;
          break;
        }
        case RtmpPraseState.BasicHeader: {
          while (this.parser.bytes < this.parser.basicBytes && offset < bytes) {
            this.parser.buffer[this.parser.bytes++] = data[p + offset++];
          }
          if (this.parser.bytes >= this.parser.basicBytes) {
            this.parser.state = RtmpPraseState.MessageHeader;
          }
          break;
        }
        case RtmpPraseState.MessageHeader: {
          size = RTMP_HEADER_SIZES[this.parser.buffer[0] >> 6] + this.parser.basicBytes;
          while (this.parser.bytes < size && offset < bytes) {
            this.parser.buffer[this.parser.bytes++] = data[p + offset++];
          }
          if (this.parser.bytes >= size) {
            this.rtmpPacketParse();
            this.parser.state = RtmpPraseState.ExtendedTimestamp;
          }
          break;
        }
        case RtmpPraseState.ExtendedTimestamp: {
          size = RTMP_HEADER_SIZES[this.parser.packet.header.fmt] + this.parser.basicBytes;
          if (this.parser.packet.header.timestamp === 0xffffff) size += 4;
          while (this.parser.bytes < size && offset < bytes) {
            this.parser.buffer[this.parser.bytes++] = data[p + offset++];
          }
          if (this.parser.bytes >= size) {
            if (this.parser.packet.header.timestamp === 0xffffff) {
              extended_timestamp = this.parser.buffer.readUInt32BE(
                RTMP_HEADER_SIZES[this.parser.packet.header.fmt] + this.parser.basicBytes
              );
            } else {
              extended_timestamp = this.parser.packet.header.timestamp;
            }

            if (this.parser.packet.bytes === 0) {
              if (RtmpChunkType.Zero === this.parser.packet.header.fmt) {
                this.parser.packet.clock = extended_timestamp;
              } else {
                this.parser.packet.clock += extended_timestamp;
              }
              this.rtmpPacketAlloc();
            }
            this.parser.state = RtmpPraseState.Payload;
          }
          break;
        }
        case RtmpPraseState.Payload: {
          size = Math.min(
            this.inChunkSize - (this.parser.packet.bytes % this.inChunkSize),
            this.parser.packet.header.length - this.parser.packet.bytes
          );
          size = Math.min(size, bytes - offset);
          if (size > 0) {
            data.copy(this.parser.packet.payload, this.parser.packet.bytes, p + offset, p + offset + size);
          }
          this.parser.packet.bytes += size;
          offset += size;

          if (this.parser.packet.bytes >= this.parser.packet.header.length) {
            this.parser.state = RtmpPraseState.Init;
            this.parser.packet.bytes = 0;
            if (this.parser.packet.clock > 0xffffffff) {
              break;
            }
            this.rtmpHandler();
          } else if (0 === this.parser.packet.bytes % this.inChunkSize) {
            this.parser.state = RtmpPraseState.Init;
          }
          break;
        }
      }
    }

    this.inAckSize += data.length;
    if (this.inAckSize >= 0xf0000000) {
      this.inAckSize = 0;
      this.inLastAck = 0;
    }
    if (this.ackSize > 0 && this.inAckSize - this.inLastAck >= this.ackSize) {
      this.inLastAck = this.inAckSize;
      this.sendACK(this.inAckSize);
    }

    this.bitrateCache.bytes += bytes;
    let current_time = Date.now();
    let diff = current_time - this.bitrateCache.last_update;
    if (diff >= this.bitrateCache.intervalMs) {
      this.bitrate = Math.round((this.bitrateCache.bytes * 8) / diff);
      this.bitrateCache.bytes = 0;
      this.bitrateCache.last_update = current_time;
    }
  }

  rtmpPacketParse() {
    let fmt = this.parser.buffer[0] >> 6;
    let cid = 0;
    if (this.parser.basicBytes === 2) {
      cid = 64 + this.parser.buffer[1];
    } else if (this.parser.basicBytes === 3) {
      cid = (64 + this.parser.buffer[1] + this.parser.buffer[2]) << 8;
    } else {
      cid = this.parser.buffer[0] & 0x3f;
    }
    let hasp = this.inPackets.has(cid);
    if (!hasp) {
      this.parser.packet = RtmpPacket.create(fmt, cid);
      this.inPackets.set(cid, this.parser.packet);
    } else {
      this.parser.packet = this.inPackets.get(cid);
    }
    this.parser.packet.header.fmt = fmt;
    this.parser.packet.header.cid = cid;
    this.rtmpChunkMessageHeaderRead();

    if (this.parser.packet.header.type > RtmpType.Metadata) {
      this.logger.error('Parse error %o', this.parser.packet);
      this.stop();
    }
  }

  rtmpChunkMessageHeaderRead() {
    let offset = this.parser.basicBytes;

    // timestamp / delta
    if (this.parser.packet.header.fmt <= RtmpChunkType.Two) {
      this.parser.packet.header.timestamp = this.parser.buffer.readUIntBE(offset, 3);
      offset += 3;
    }

    // message length + type
    if (this.parser.packet.header.fmt <= RtmpChunkType.One) {
      this.parser.packet.header.length = this.parser.buffer.readUIntBE(offset, 3);
      this.parser.packet.header.type = this.parser.buffer[offset + 3];
      offset += 4;
    }

    if (this.parser.packet.header.fmt === RtmpChunkType.Zero) {
      this.parser.packet.header.stream_id = this.parser.buffer.readUInt32LE(offset);
      offset += 4;
    }
    return offset;
  }

  rtmpPacketAlloc() {
    if (this.parser.packet.capacity < this.parser.packet.header.length) {
      this.parser.packet.payload = Buffer.alloc(this.parser.packet.header.length + 1024);
      this.parser.packet.capacity = this.parser.packet.header.length + 1024;
    }
  }

  rtmpHandler() {
    switch (this.parser.packet.header.type) {
      case RtmpType.SetChunkSize:
      case RtmpType.Abort:
      case RtmpType.Ack:
      case RtmpType.WindowAckSize:
      case RtmpType.SetPeerBandwidth:
        return 0 === this.rtmpControlHandler() ? -1 : 0;
      case RtmpType.Event:
        return 0 === this.rtmpEventHandler() ? -1 : 0;
      case RtmpType.Audio:
        return this.rtmpAudioHandler();
      case RtmpType.Video:
        return this.rtmpVideoHandler();
      case RtmpType.FlexMessage:
      case RtmpType.Invoke:
        return this.rtmpInvokeHandler();
      case RtmpType.FlexStream: // AMF3
      case RtmpType.Data: // AMF0
        return this.rtmpDataHandler();
    }
  }

  rtmpControlHandler() {
    const payload = this.parser.packet.payload;
    switch (this.parser.packet.header.type) {
      case RtmpType.SetChunkSize:
        this.inChunkSize = payload.readUInt32BE();
        break;
      case RtmpType.Abort:
        break;
      case RtmpType.Ack:
        break;
      case RtmpType.WindowAckSize:
        this.ackSize = payload.readUInt32BE();
        break;
      case RtmpType.SetPeerBandwidth:
        break;
    }
  }

  rtmpEventHandler() {}

  rtmpAudioHandler() {
    const payload = this.parser.packet.payload.slice(0, this.parser.packet.header.length);
    const sound = {
      format: (payload[0] >> 4) & 0x0f,
      type: (payload[0] & 0x01) + 1,
      size: (payload[0] >> 1) & 0x01,
      rate: (payload[0] >> 2) & 0x03,
    };

    if (this.audio.codec == 0) {
      this.audio.codec = sound.format;
      this.audio.codecName = AV.AUDIO_CODEC_NAME[sound.format];
      this.audio.samplerate = AV.AUDIO_SOUND_RATE[sound.rate];
      this.audio.channels = sound.type;

      if (sound.format == 4) {
        // Nellymoser 16 kHz
        this.audio.samplerate = 16000;
      } else if (sound.format == 5 || sound.format == 7 || sound.format == 8) {
        // Nellymoser 8 kHz | G.711 A-law | G.711 mu-law
        this.audio.samplerate = 8000;
      } else if (sound.format == 11) {
        // Speex
        this.audio.samplerate = 16000;
      } else if (sound.format == 14) {
        // MP3 8 kHz
        this.audio.samplerate = 8000;
      }

      if (sound.format != 10 && sound.format != 13) {
        this.logger.info(
          '[PublishSession] Handling audio Sound=%j | Path=%s | Audio=%j',
          sound,
          this.publish.streamPath,
          this.audio
        );
      }
    }

    if ((sound.format == 10 || sound.format == 13) && payload[1] == 0) {
      // cache aac sequence header
      this.isFirstAudioReceived = true;
      this.aacSequenceHeader = Buffer.alloc(payload.length);
      payload.copy(this.aacSequenceHeader);
      if (sound.format == 10) {
        const info = AV.readAACSpecificConfig(this.aacSequenceHeader);
        this.audio.profileName = AV.getAACProfileName(info);
        this.audio.samplerate = info.sample_rate;
        this.audio.channels = info.channels;
      } else {
        this.audio.samplerate = 48000;
        this.audio.channels = payload[11];
      }
      this.logger.info(
        '[PublishSession] Handling audio Sound=%j | Path=%s | Audio=%j',
        sound,
        this.publish.streamPath,
        this.audio
      );
    }

    const packet = RtmpPacket.create({
      payload,
      header: {
        fmt: RtmpChunkType.Zero,
        cid: RtmpChannel.Audio,
        type: RtmpType.Audio,
        length: payload.length,
        timestamp: this.parser.packet.clock,
      },
    });
    const chunk = packet.toBuffer(this.outChunkSize);

    // cache gop
    if (this.rtmpGopCacheQueue != null) {
      if (this.aacSequenceHeader != null && payload[1] === 0) {
        // skip aac sequence header
      } else {
        this.rtmpGopCacheQueue.add(chunk);
      }
    }

    for (const playerId of this.players) {
      const session = AppContext.getSession(playerId);

      if (session.numPlayCache === 0) {
        session.socket.cork();
      }

      if (session.isStarting && session.isPlaying && !session.isPause && session.isReceiveAudio) {
        chunk.writeUInt32LE(session.play.streamId, 8);
        session.socket.write(chunk);
      }

      ++session.numPlayCache;

      if (session.numPlayCache === 10) {
        process.nextTick(() => session.socket.uncork());
        session.numPlayCache = 0;
      }
    }
  }

  rtmpVideoHandler() {
    let payload = this.parser.packet.payload.slice(0, this.parser.packet.header.length);
    let isExHeader = ((payload[0] >> 4) & 0b1000) !== 0;
    let frame_type = (payload[0] >> 4) & 0b0111;
    let codec_id = payload[0] & 0x0f;
    let packetType = payload[0] & 0x0f;
    if (isExHeader) {
      if (packetType == PacketType.Metadata) {
      } else if (packetType == PacketType.SequenceEnd) {
      }
      let $FourCC = payload.subarray(1, 5);
      if ($FourCC.compare(FourCC.HEVC) == 0) {
        codec_id = 12;
        if (packetType == PacketType.SequenceStart) {
          payload[0] = 0x1c;
          payload[1] = 0;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
        } else if (packetType == PacketType.CodedFrames || packetType == PacketType.CodedFramesX) {
          if (packetType == PacketType.CodedFrames) {
            payload = payload.subarray(3);
          } else {
            payload[2] = 0;
            payload[3] = 0;
            payload[4] = 0;
          }
          payload[0] = (frame_type << 4) | 0x0c;
          payload[1] = 1;
        }
      } else if ($FourCC.compare(FourCC.AV1) == 0) {
        codec_id = 13;
        if (packetType == PacketType.SequenceStart) {
          payload[0] = 0x1d;
          payload[1] = 0;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
        } else if (packetType == PacketType.MPEG2TSSequenceStart) {
        } else if (packetType == PacketType.CodedFrames) {
          payload[0] = (frame_type << 4) | 0x0d;
          payload[1] = 1;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
        }
      } else {
        this.logger.warn(`[PublishSession] Unsupported extension header`);
        return;
      }
    }

    if (this.video.fps === 0) {
      if (this.video.count++ === 0) {
        setTimeout(() => {
          this.video.fps = Math.ceil(this.video.count / 5);
        }, 5000);
      }
    }

    if (codec_id == 7 || codec_id == 12 || codec_id == 13) {
      // cache avc sequence header
      if (frame_type == 1 && payload[1] == 0) {
        this.avcSequenceHeader = Buffer.alloc(payload.length);
        payload.copy(this.avcSequenceHeader);
        const info = AV.readAVCSpecificConfig(this.avcSequenceHeader);
        this.video.width = info.width;
        this.video.height = info.height;
        this.video.profileName = AV.getAVCProfileName(info);
        this.video.level = info.level;
      }
    }

    if (this.video.codec == 0) {
      this.video.codec = codec_id;
      this.video.codecName = AV.VIDEO_CODEC_NAME[codec_id];
      this.logger.info(
        '[PublishSession] Handling video | Path=%s | FrameType=%d | Video=%j',
        this.publish.streamPath,
        frame_type,
        this.video
      );
    }

    const packet = RtmpPacket.create({
      payload,
      header: {
        fmt: RtmpChunkType.Zero,
        cid: RtmpChannel.Video,
        type: RtmpType.Video,
        length: payload.length,
        timestamp: this.parser.packet.clock,
      },
    });
    const chunk = packet.toBuffer(this.outChunkSize);

    // cache gop
    if (this.rtmpGopCacheQueue != null) {
      if (frame_type == 1) {
        this.rtmpGopCacheQueue.clear();
      }
      if ((codec_id == 7 || codec_id == 12 || codec_id == 13) && frame_type == 1 && payload[1] == 0) {
        // skip avc sequence header
      } else {
        this.rtmpGopCacheQueue.add(chunk);
      }
    }

    for (const playerId of this.players) {
      const session = AppContext.getSession(playerId);

      if (session.numPlayCache === 0) {
        session.socket.cork();
      }

      if (session.isStarting && session.isPlaying && !session.isPause && session.isReceiveVideo) {
        chunk.writeUInt32LE(session.play.streamId, 8);
        session.socket.write(chunk);
      }

      session.numPlayCache++;

      if (session.numPlayCache === 10) {
        process.nextTick(() => session.socket.uncork());
        session.numPlayCache = 0;
      }
    }
  }

  rtmpDataHandler() {
    const offset = this.parser.packet.header.type === RtmpType.FlexStream ? 1 : 0;
    const payload = this.parser.packet.payload.slice(offset, this.parser.packet.header.length);
    const dataMessage = AMF.decodeAmf0Data(payload);
    switch (dataMessage.cmd) {
      case '@setDataFrame':
        if (dataMessage.dataObj) {
          this.audio.samplerate = dataMessage.dataObj.audiosamplerate;
          this.audio.channels = dataMessage.dataObj.stereo ? 2 : 1;
          this.video.width = dataMessage.dataObj.width;
          this.video.height = dataMessage.dataObj.height;
          this.video.fps = dataMessage.dataObj.framerate;
        }

        this.metadata = AMF.encodeAmf0Data({
          cmd: 'onMetaDAta',
          dataObj: dataMessage.dataObj,
        });

        const packet = RtmpPacket.create();
        packet.header.fmt = RtmpChunkType.Zero;
        packet.header.cid = RtmpChannel.Data;
        packet.header.type = RtmpType.Data;
        packet.payload = this.metadata;
        packet.header.length = packet.payload.length;
        const chunk = packet.toBuffer(this.outChunkSize);

        for (const playerId of this.players) {
          const session = AppContext.getSession(playerId);
          if (session && session.isStarting && session.isPlaying && !session.isPause) {
            chunk.writeUInt32LE(session.play.streamId, 8);
            session.socket.write(chunk);
          }
        }
        break;
    }
  }

  rtmpInvokeHandler() {
    const offset = this.parser.packet.header.type === RtmpType.FlexMessage ? 1 : 0;
    const payload = this.parser.packet.payload.slice(offset, this.parser.packet.header.length);
    const invokeMessage = AMF.decodeAmf0Cmd(payload);
    switch (invokeMessage.cmd) {
      case 'connect': {
        this.onConnect(invokeMessage);
        break;
      }
      case 'releaseStream': {
        break;
      }
      case 'FCPublish': {
        break;
      }
      case 'createStream': {
        this.onCreateStream(invokeMessage);
        break;
      }
      case 'publish': {
        this.onPublish(invokeMessage);
        break;
      }
      case 'play': {
        this.onPlay(invokeMessage);
        break;
      }
      case 'pause': {
        this.onPause(invokeMessage);
        break;
      }
      case 'FCUnpublish': {
        break;
      }
      case 'deleteStream': {
        this.onDeleteStream(invokeMessage);
        break;
      }
      case 'closeStream': {
        this.onCloseStream();
        break;
      }
      case 'receiveAudio': {
        this.onReceiveAudio(invokeMessage);
        break;
      }
      case 'receiveVideo': {
        this.onReceiveVideo(invokeMessage);
        break;
      }
    }
  }

  sendACK(size) {
    const chunk = Buffer.from('02000000000004030000000000000000', 'hex');
    chunk.writeUInt32BE(size, 12);
    this.socket.write(chunk);
  }

  sendWindowACK(size) {
    const chunk = Buffer.from('02000000000004050000000000000000', 'hex');
    chunk.writeUInt32BE(size, 12);
    this.socket.write(chunk);
  }

  setPeerBandwidth(size, type) {
    const chunk = Buffer.from('0200000000000506000000000000000000', 'hex');
    chunk.writeUInt32BE(size, 12);
    chunk[16] = type;
    this.socket.write(chunk);
  }

  setChunkSize(size) {
    const chunk = Buffer.from('02000000000004010000000000000000', 'hex');
    chunk.writeUInt32BE(size, 12);
    this.socket.write(chunk);
  }

  sendStreamStatus(st, id) {
    const chunk = Buffer.from('020000000000060400000000000000000000', 'hex');
    chunk.writeUInt16BE(st, 12);
    chunk.writeUInt32BE(id, 14);
    this.socket.write(chunk);
  }

  sendInvokeMessage(sid, opt) {
    const payload = AMF.encodeAmf0Cmd(opt);
    const packet = RtmpPacket.create({
      payload,
      header: {
        fmt: RtmpChunkType.Zero,
        cid: RtmpChannel.Invoke,
        type: RtmpType.Invoke,
        stream_id: sid,
        length: payload.length,
      },
    });
    const chunk = packet.toBuffer(this.outChunkSize);
    this.socket.write(chunk);
  }

  sendDataMessage(opt, sid) {
    const payload = AMF.encodeAmf0Data(opt);
    const packet = RtmpPacket.create({
      payload,
      header: {
        fmt: RtmpChunkType.Zero,
        cid: RtmpChannel.Data,
        type: RtmpType.Data,
        stream_id: sid,
        length: payload.length,
      },
    });
    const chunk = packet.toBuffer(this.outChunkSize);
    this.socket.write(chunk);
  }

  sendStatusMessage(sid, level, code, description) {
    const opt = {
      cmd: 'onStatus',
      transId: 0,
      cmdObj: null,
      info: {
        level: level,
        code: code,
        description: description,
      },
    };
    this.sendInvokeMessage(sid, opt);
  }

  sendRtmpSampleAccess(sid) {
    const opt = {
      cmd: '|RtmpSampleAccess',
      bool1: false,
      bool2: false,
    };
    this.sendDataMessage(opt, sid);
  }

  sendPingRequest() {
    const currentTimestamp = this.duration;
    const packet = RtmpPacket.create();
    packet.header.fmt = RtmpChunkType.Zero;
    packet.header.cid = RtmpChannel.Protocol;
    packet.header.type = RtmpType.Event;
    packet.header.timestamp = currentTimestamp;
    packet.payload = Buffer.from([
      0,
      6,
      (currentTimestamp >> 24) & 0xff,
      (currentTimestamp >> 16) & 0xff,
      (currentTimestamp >> 8) & 0xff,
      currentTimestamp & 0xff,
    ]);
    packet.header.length = packet.payload.length;
    const chunk = packet.toBuffer(this.outChunkSize);
    this.socket.write(chunk);
  }

  respondConnect(transId) {
    const opt = {
      transId,
      cmd: '_result',
      cmdObj: {
        fmsVer: 'FMS/3,0,1,123',
        capabilities: 31,
      },
      info: {
        level: 'status',
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded.',
        objectEncoding: this.objectEncoding,
      },
    };
    this.sendInvokeMessage(0, opt);
  }

  respondCreateStream(transId) {
    ++this.streams;
    const opt = {
      transId,
      cmd: '_result',
      cmdObj: null,
      info: this.streams,
    };
    this.sendInvokeMessage(0, opt);
  }

  respondPlay() {
    this.sendStreamStatus(StreamState.Begin, this.play.streamId);
    this.sendStatusMessage(this.play.streamId, 'status', 'NetStream.Play.Reset', 'Playing and resetting stream.');
    this.sendStatusMessage(this.play.streamId, 'status', 'NetStream.Play.Start', 'Started playing stream.');
    this.sendRtmpSampleAccess();
  }

  /**
   * @param {AMF.ConnectCommand} invokeMessage
   */
  onConnect(invokeMessage) {
    invokeMessage.cmdObj.app = invokeMessage.cmdObj.app.replace('/', ''); // fix jwplayer
    AppContext.emit('pre-connect', this.id, invokeMessage.cmdObj);
    if (!this.isStarting) {
      return;
    }
    this.connectCmdObj = invokeMessage.cmdObj;
    this.app = invokeMessage.cmdObj.app;
    this.objectEncoding = invokeMessage.cmdObj.objectEncoding != null ? invokeMessage.cmdObj.objectEncoding : 0;
    this.connectTime = new Date();
    this.startTimestamp = Date.now();
    this.pingInterval = setInterval(() => this.sendPingRequest(), this.pingTime);
    this.sendWindowACK(5000000);
    this.setPeerBandwidth(5000000, 2);
    this.setChunkSize(this.outChunkSize);
    this.respondConnect(invokeMessage.transId);
    this.bitrateCache = {
      intervalMs: 1000,
      last_update: this.startTimestamp,
      bytes: 0,
    };
    this.logger.info(
      '[PublishSession] Connect IP=%s | App=%s | Args=%o',
      this.socket.remoteAddress,
      this.app,
      invokeMessage.cmdObj
    );
    AppContext.emit('post-connect', this.id, invokeMessage.cmdObj);
  }

  /**
   * @param {AMF.ActionCommand} invokeMessage
   */
  onCreateStream(invokeMessage) {
    this.respondCreateStream(invokeMessage.transId);
  }

  /**
   * @param {AMF.PublishCommand} invokeMessage
   */
  async onPublish(invokeMessage) {
    if (!_.isString(invokeMessage.streamName)) {
      return;
    }
    const prisma = AppContext.get(PrismaService);

    const [name, query] = invokeMessage.streamName.split('?');

    const streamId = this.parser.packet.header.stream_id;
    const streamPath = `/${this.app}/${name}`;
    const args = qs.parse(query);

    this.publish = { streamId, streamPath, args };

    AppContext.emit('pre-publish', this.id, streamPath, args);
    if (!this.isStarting) {
      return;
    }
    try {
      let stream = await prisma.stream.findFirst({
        where: { name },
      });

      if (_.isNil(stream)) {
        this.sendStatusMessage(streamId, 'error', 'NetStream.Publish.BadName', 'Not Found');
        return this.reject(`Stream is not existed | Path=${streamPath} | StreamID=${streamId}`);
      }

      if (this.auth.publish && !Hash.compare(args.token, stream.token)) {
        this.sendStatusMessage(streamId, 'error', 'NetStream.Publish.Unauthorized', 'Unauthorized');
        return this.reject(`Unauthorized | Path=${streamPath} | StreamID=${streamId}`);
      }

      if (stream.status !== StreamStatus.Pending) {
        this.sendStatusMessage(streamId, 'error', 'NetStream.Publish.BadConnection', 'Conflict');
        return this.reject(`Stream was ${stream.status} | Path=${streamPath} | StreamID=${streamId}`);
      }

      stream = await prisma.stream.update({
        where: { name },
        data: { status: StreamStatus.Publishing },
      });

      this.logger.info('[PublishSession] New stream | Path=%s | StreamID=%d', streamPath, streamId);
      AppContext.putPublisher(streamPath, this.id);
      this.isPublishing = true;

      this.sendStatusMessage(streamId, 'status', 'NetStream.Publish.Start', `${streamPath} is now published.`);
      AppContext.emit('post-publish', this.id, streamPath, args);
    } catch (error) {
      this.logger.error(error);
      this.sendStatusMessage(streamId, 'error', 'NetStream.Publish.Failed', 'Server error');
      return this.reject(`Server error | Path=${streamPath} | StreamID=${streamId}`);
    }
  }

  /**
   * @param {AMF.PlayCommand} invokeMessage
   */
  async onPlay(invokeMessage) {
    if (!_.isString(invokeMessage.streamName)) {
      return;
    }
    const prisma = AppContext.get(PrismaService);

    const [name, query] = invokeMessage.streamName.split('?');

    const streamId = this.parser.packet.header.stream_id;
    const streamPath = `/${this.app}/${name}`;
    const args = qs.parse(query);

    this.play = { streamId, streamPath, args };

    AppContext.emit('pre-play', this.id, streamPath, args);

    if (!this.isStarting) {
      return;
    }

    try {
      let stream = await prisma.stream.findFirst({
        where: { name },
      });

      if (_.isNil(stream)) {
        this.reject(`stream is not existed | Path=${streamPath} | StreamID=${streamId}`);
        return this.sendStatusMessage(streamId, 'error', 'NetStream.Play.BadName', 'Not Found');
      }

      if (this.auth.play && !this.isLocal && !Hash.compare(args.token, stream.token)) {
        this.logger.warn('[PlaySession] Unauthorized | Path=%s | StreamID=%d | Token=%s', streamPath, streamId, token);
        return this.sendStatusMessage(streamId, 'error', 'NetStream.Play.Unauthorized', 'Unauthorized');
      }

      if (this.isPlaying) {
        this.logger.info(`[PlaySession] NetConnection is playing | Path=%s | StreamID=%d`, streamPath, streamId);
        this.sendStatusMessage(
          streamId,
          'error',
          'NetStream.Play.BadConnection',
          'Connection has been already playing'
        );
      } else {
        this.respondPlay();
      }

      if (AppContext.hasPublisher(streamPath)) {
        this.onStartPlay();
      } else {
        this.logger.info(`[PlaySession] Stream not found | Path=%s | StreamID=%d`, streamPath, streamId);
        this.isIdling = true;
      }
    } catch (error) {
      this.logger.error(error);
      this.sendStatusMessage(streamId, 'error', 'NetStream.Play.Failed', 'Server error');
    }
  }

  onStartPlay() {
    const { args, streamId, streamPath } = this.play;

    const publisherId = AppContext.getPublisherID(streamPath);
    const publisher = AppContext.getSession(publisherId);
    const players = publisher.players;
    players.add(this.id);

    if (publisher.metadata != null) {
      const payload = publisher.metadata;
      const packet = RtmpPacket.create({
        payload,
        header: {
          fmt: RtmpChunkType.Zero,
          cid: RtmpChannel.Data,
          type: RtmpType.Data,
          length: payload.length,
          stream_id: streamId,
        },
      });
      const chunks = packet.toBuffer(this.outChunkSize);
      this.socket.write(chunks);
    }

    if (publisher.audio.codec === 10 || publisher.audio.codec === 13) {
      const payload = publisher.aacSequenceHeader;
      const packet = RtmpPacket.create({
        payload,
        header: {
          fmt: RtmpChunkType.Zero,
          cid: RtmpChannel.Audio,
          type: RtmpType.Audio,
          length: payload.length,
          stream_id: streamId,
        },
      });
      const chunk = packet.toBuffer(this.outChunkSize);
      this.socket.write(chunk);
    }

    if (publisher.video.codec === 7 || publisher.video.codec === 12 || publisher.video.codec === 13) {
      const payload = publisher.avcSequenceHeader;
      const packet = RtmpPacket.create({
        payload,
        header: {
          fmt: RtmpChunkType.Zero,
          cid: RtmpChannel.Video,
          type: RtmpType.Video,
          length: payload.length,
          stream_id: streamId,
        },
      });
      const chunk = packet.toBuffer(this.outChunkSize);
      this.socket.write(chunk);
    }

    if (publisher.rtmpGopCacheQueue) {
      for (const chunk of publisher.rtmpGopCacheQueue) {
        chunk.writeUInt32LE(streamId, 8);
        this.socket.write(chunk);
      }
    }

    this.isIdling = false;
    this.isPlaying = true;
    AppContext.emit('post-play', this.id, streamPath, args);

    this.logger.info(`[PlaySession] A user join stream | Path=${streamPath} | StreamID=${streamId}`);
  }

  /**
   * @param {AMF.PauseCommand} invokeMessage
   */
  onPause(invokeMessage) {
    this.isPause = invokeMessage.pause;
    const code = this.isPause ? 'NetStream.Pause.Notify' : 'NetStream.Unpause.Notify';
    const description = this.isPause ? 'Paused live' : 'Unpaused live';
    this.logger.info(`[PlaySession] ${description} Path=${this.play.streamPath} | StreamID=${this.play.streamId}`);
    if (!this.isPause) {
      this.sendStreamStatus(StreamState.Begin, this.play.streamId);
      if (AppContext.hasPublisher(this.play.streamPath)) {
        // fix ckplayer
        const publisherId = AppContext.getPublisherID(this.play.streamPath);
        const publisher = AppContext.getSession(publisherId);
        if (publisher.audio.codec === 10 || publisher.audio.codec === 13) {
          const packet = RtmpPacket.create({
            header: {
              fmt: RtmpChunkType.Zero,
              cid: RtmpChannel.Audio,
              type: RtmpChannel.Audio,
              length: publisher.aacSequenceHeader.length,
              stream_id: this.play.streamId,
              timestamp: publisher.parser.packet.clock, // ?? 0 or clock
            },
            payload: publisher.aacSequenceHeader,
          });
          const chunk = packet.toBuffer(this.outChunkSize);
          this.socket.write(chunk);
        }
        if (publisher.video.codec === 7 || publisher.video.codec === 12 || publisher.video.codec === 13) {
          const packet = RtmpPacket.create({
            header: {
              fmt: RtmpChunkType.Zero,
              cid: RtmpChannel.Video,
              type: RtmpChannel.Video,
              length: publisher.avcSequenceHeader.length,
              stream_id: this.play.streamId,
              timestamp: publisher.parser.packet.clock, // ?? 0 or clock
            },
            payload: publisher.avcSequenceHeader,
          });
          const chunk = packet.toBuffer(this.outChunkSize);
          this.socket.write(chunk);
        }
      }
    } else {
      this.sendStreamStatus(StreamState.EOF, this.play.streamId);
    }
    this.sendStatusMessage(this.play.streamId, code, description);
  }

  /**
   * @param {AMF.ReceiveAudioCommand} invokeMessage
   */
  onReceiveAudio(invokeMessage) {
    this.isReceiveAudio = invokeMessage.bool;
    this.logger.info(`[PlaySession] receiveAudio=${this.isReceiveAudio}`);
  }

  /**
   * @param {AMF.ReceiveVideoCommand} invokeMessage
   */
  onReceiveVideo(invokeMessage) {
    this.isReceiveVideo = invokeMessage.bool;
    this.logger.info(`[PlaySession] receiveVideo=${this.isReceiveVideo}`);
  }

  onCloseStream() {
    // red5-publisher
    this.onDeleteStream({ streamId: this.parser.packet.header.stream_id });
  }

  /**
   * @param {AMF.DeleteStreamCommand} invokeMessage
   */
  async onDeleteStream(invokeMessage) {
    const prisma = AppContext.get(PrismaService);

    if (invokeMessage.streamId == this.play.streamId) {
      const { args, streamId, streamPath } = this.play;
      if (this.isIdling) {
        this.isIdling = false;
      } else {
        const publisherId = AppContext.getPublisherID(streamPath);
        if (publisherId != null) {
          AppContext.getSession(publisherId).players.delete(this.id);
        }
        AppContext.emit('done-play', this.id, streamPath, args);
        this.isPlaying = false;
      }
      this.logger.info(`[PlaySession] Closing Path=${streamPath} | StreamID=${streamId}`);
      if (this.isStarting) {
        this.sendStatusMessage(streamId, 'status', 'NetStream.Play.Stop', 'Stopped playing stream.');
      }
      this.play = {
        streamId: 0,
        streamPath: '',
        args: {},
      };
    }

    if (invokeMessage.streamId == this.publish.streamId) {
      const { args, streamId, streamPath } = this.publish;
      if (this.isPublishing) {
        this.logger.info(`[PublishSession] Closing Path=${streamPath} | StreamID=${streamId}`);
        AppContext.emit('done-publish', this.id, streamPath, args);
        if (this.isStarting) {
          this.sendStatusMessage(streamId, 'status', 'NetStream.Unpublish.Success', 'Stream is unpublished');
        }
        this.closePlayers();
        AppContext.removePublisher(this.publish.streamPath);
        if (this.rtmpGopCacheQueue) {
          this.rtmpGopCacheQueue.clear();
        }
        this.isPublishing = false;
        const name = streamPath.replace(`/${this.app}/`, '');
        await prisma.stream.update({
          where: { name },
          data: { status: StreamStatus.Closed },
        });
      }
      this.publish = {
        streamId: 0,
        streamPath: '',
        args: {},
      };
    }
  }

  closePlayers() {
    for (const playerId of this.players) {
      const s = AppContext.getSession(playerId);
      s.sendStatusMessage(s.play.streamId, 'status', 'NetStream.Play.UnpublishNotify', 'Stream is unpublished.');
      s.flush();
    }
    this.players.clear();
  }
}

module.exports = { RtmpSession };
