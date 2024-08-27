exports.N_CHUNK_STREAM = 8;

exports.RTMP_HANDSHAKE_SIZE = 1536;

/** @enum */
exports.HandshakeState = Object.freeze({
  Uninitialized: 0,
  VersionSent: 1,
  AckSent: 2,
  Done: 3,
});

/** @enum */
exports.RtmpPraseState = Object.freeze({
  Init: 0,
  BasicHeader: 1,
  MessageHeader: 2,
  ExtendedTimestamp: 3,
  Payload: 4,
});

exports.MAX_CHUNK_HEADER = 18;

/** @enum */
exports.RtmpChunkType = Object.freeze({
  /**
   * 11-bytes: timestamp(3) + length(3) + stream type(1) + stream id(4)
   */
  Zero: 0,
  /**
   * 7-bytes: delta(3) + length(3) + stream type(1)
   */
  One: 1,
  /**
   * 3-bytes: delta(3)
   */
  Two: 2,
  /**
   * 0-byte
   */
  Three: 3,
});

/** @enum */
exports.RtmpChannel = Object.freeze({
  Protocol: 2,
  Invoke: 3,
  Audio: 4,
  Video: 5,
  Data: 6,
});

exports.RTMP_HEADER_SIZES = [11, 7, 3, 0];

/** @enum */
exports.RtmpType = Object.freeze({
  // Protocol Control Messages
  SetChunkSize: 1,
  Abort: 2,
  /** Byte read report */
  Ack: 3,
  /** Server bandwidth */
  WindowAckSize: 5,
  /** Client bandwidth */
  SetPeerBandwidth: 6,

  // User Control Messages Event
  Event: 4,
  Audio: 8,
  Video: 9,

  // Data message
  /** AMF3 */
  FlexStream: 15,
  /** AMF0 */
  Data: 18,

  // Shared Object Message
  /** AMF3 */
  FlexObject: 16,
  /** AMF0 */
  SharedObject: 19,

  // Command Message
  /** AMF3 */
  FlexMessage: 17,
  /** AMF0 */
  Invoke: 20,

  // Aggregate Message
  Metadata: 20,
});

exports.RTMP_CHUNK_SIZE = 128;

/** @enum */
exports.StreamState = Object.freeze({
  Begin: 0x00,
  EOF: 0x01,
  Dry: 0x02,
  Empty: 0x1f,
  Ready: 0x20,
});

/**
 * Enhancing RTMP, FLV  2023-03-v1.0.0-B.9
 * @link https://github.com/veovera/enhanced-rtmp
 * @enum
 */
exports.FourCC = Object.freeze({
  AV1: Buffer.from('av01'),
  VP9: Buffer.from('vp09'),
  HEVC: Buffer.from('hvc1'),
});

/** @enum */
exports.PacketType = Object.freeze({
  SequenceStart: 0,
  CodedFrames: 1,
  SequenceEnd: 2,
  CodedFramesX: 3,
  Metadata: 4,
  MPEG2TSSequenceStart: 5,
});
