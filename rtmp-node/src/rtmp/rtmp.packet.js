const { RtmpChunkType, RTMP_HEADER_SIZES } = require('./rtmp.constants');

const $default = {
  clock: 0,
  payload: null,
  capacity: 0,
  bytes: 0,
  header: {
    fmt: 0,
    cid: 0,
    type: 0,
    length: 0,
    timestamp: 0,
    stream_id: 0,
  },
};

class RtmpPacket {
  static create(data = $default) {
    return new RtmpPacket(data);
  }

  constructor(data = $default) {
    const { bytes = 0, capacity = 0, clock = 0, header = {}, payload = null } = data;
    const { cid = 0, fmt = 0, length = 0, stream_id = 0, timestamp = 0, type = 0 } = header;
    this.clock = clock;
    this.payload = payload;
    this.capacity = capacity;
    this.bytes = bytes;
    this.header = {
      fmt,
      cid,
      type,
      length,
      timestamp,
      stream_id,
    };
  }

  toBuffer(size = 128) {
    let header = this.header;
    let payload = this.payload;
    let payloadSize = header.length;
    let chunkSize = size;
    let chunksOffset = 0;
    let payloadOffset = 0;
    let chunkBasicHeader = this.createBasicHeader(header.fmt, header.cid);
    let chunkBasicHeader3 = this.createBasicHeader(RtmpChunkType.Three, header.cid);
    let chunkMessageHeader = this.createMessageHeader();
    let useExtendedTimestamp = header.timestamp >= 0xffffff;
    let headerSize = chunkBasicHeader.length + chunkMessageHeader.length + (useExtendedTimestamp ? 4 : 0);
    let n = headerSize + payloadSize + Math.floor(payloadSize / chunkSize);

    if (useExtendedTimestamp) {
      n += Math.floor(payloadSize / chunkSize) * 4;
    }
    if (!(payloadSize % chunkSize)) {
      n -= 1;
      if (useExtendedTimestamp) {
        //TODO CHECK
        n -= 4;
      }
    }

    let chunks = Buffer.alloc(n);
    chunkBasicHeader.copy(chunks, chunksOffset);
    chunksOffset += chunkBasicHeader.length;
    chunkMessageHeader.copy(chunks, chunksOffset);
    chunksOffset += chunkMessageHeader.length;
    if (useExtendedTimestamp) {
      chunks.writeUInt32BE(header.timestamp, chunksOffset);
      chunksOffset += 4;
    }
    while (payloadSize > 0) {
      if (payloadSize > chunkSize) {
        payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + chunkSize);
        payloadSize -= chunkSize;
        chunksOffset += chunkSize;
        payloadOffset += chunkSize;
        chunkBasicHeader3.copy(chunks, chunksOffset);
        chunksOffset += chunkBasicHeader3.length;
        if (useExtendedTimestamp) {
          chunks.writeUInt32BE(header.timestamp, chunksOffset);
          chunksOffset += 4;
        }
      } else {
        payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + payloadSize);
        payloadSize -= payloadSize;
        chunksOffset += payloadSize;
        payloadOffset += payloadSize;
      }
    }
    return chunks;
  }

  createBasicHeader(fmt, cid) {
    if (cid >= 64 + 255) {
      const out = Buffer.alloc(3);
      out[0] = (fmt << 6) | 1;
      out[1] = (cid - 64) & 0xff;
      out[2] = ((cid - 64) >> 8) & 0xff;
      return out;
    }
    if (cid >= 64) {
      const out = Buffer.alloc(2);
      out[0] = (fmt << 6) | 0;
      out[1] = (cid - 64) & 0xff;
      return out;
    }
    const out = Buffer.alloc(1);
    out[0] = (fmt << 6) | cid;
    return out;
  }

  createMessageHeader() {
    const header = this.header;
    const out = Buffer.alloc(RTMP_HEADER_SIZES[header.fmt % 4]);

    if (header.fmt <= RtmpChunkType.Two) {
      out.writeUIntBE(header.timestamp >= 0xffffff ? 0xffffff : header.timestamp, 0, 3);
    }

    if (header.fmt <= RtmpChunkType.One) {
      out.writeUIntBE(header.length, 3, 3);
      out.writeUInt8(header.type, 6);
    }

    if (header.fmt === RtmpChunkType.Zero) {
      out.writeUInt32LE(header.stream_id, 7);
    }

    return out;
  }
}

module.exports = { RtmpPacket };
