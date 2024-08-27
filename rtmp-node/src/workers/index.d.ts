export type Bitrate = number | { min?: number; max?: number };

export type HLSFlag =
  | 'single_file'
  | 'delete_segments'
  | 'append_list'
  | 'round_durations'
  | 'discont_start'
  | 'omit_endlist'
  | 'periodic_rekey'
  | 'independent_segments'
  | 'iframes_only'
  | 'split_by_time'
  | 'program_date_time'
  | 'second_level_segment_index'
  | 'second_level_segment_size'
  | 'second_level_segment_duration'
  | 'temp_file';

export type EncodingPreset =
  | 'veryslow'
  | 'slower'
  | 'slow'
  | 'medium'
  | 'fast'
  | 'veryfast'
  | 'superfast'
  | 'ultrafast';

export interface ResolutionConfig {
  /**
   * Video width in pixel
   */
  w: number;
  /**
   * Video height in pixel
   */
  h: number;
  /**
   * Video bitrate in kbps
   */
  vb?: Bitrate;
  /**
   * Audio bitrate in kbps
   */
  ab?: Bitrate;
}

export interface HLSOptions {
  /**
   * Audio sample rate in Hz
   *
   * @default 44100
   */
  ar?: number;
  /**
   * Audio channel count (1 - Mono, 2 - Stereo, 6 - 5.1)
   *
   * @default 1
   */
  ac?: number;
  /**
   * Video codec
   *
   * @default h264
   */
  vcodec?: string;
  /**
   * Audio codec
   *
   * @default aac
   */
  acodec?: string;
  /**
   * Resolution config
   */
  resolutions: ResolutionConfig[];
  /**
   * Encoding preset
   *
   * @default fast
   */
  preset?: EncodingPreset;
  /**
   * Segment duration in second
   *
   * @default 2
   */
  hls_time?: number;
  /**
   * Forces hls_list_size to 0.
   * - `event` the playlist can only be appended to
   * - `vod` the playlist must not change
   *
   * @default event
   */
  hls_playlist_type?: 'event' | 'vod';
  /**
   * HLS flags
   */
  hls_flags?: HLSFlag[];
  /**
   * Number of threads used for encoding
   *
   * @default 0
   */
  threads?: number;
}

export interface TransformWorkerConfig {
  /**
   * RTMP server port
   *
   * @default 1935
   */
  port?: number;
  /**
   * Media transfer url
   */
  transfer_url?: string;
  /**
   * HLS transform options
   */
  hls?: HLSOptions;
}

export declare class TransformWorker {
  constructor(config: TransformWorkerConfig);
  transform(id: string, path: string): void;
  kill(id: string): void;
  onBootstrap(): void;
  onDestroy(): void;
}
