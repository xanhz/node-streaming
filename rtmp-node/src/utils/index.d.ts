export namespace AMF {
  interface ActionCommand<T = any> {
    transId: number;
    cmd: string;
    cmdObj: T;
  }

  export interface ResultCommand extends ActionCommand {
    info: any;
  }

  export interface ErrorCommand extends ActionCommand {
    streamId: number;
    info: any;
  }

  export interface OnStatusCommand extends ActionCommand {
    info: any;
  }

  export interface ReleaseStreamCommand extends ActionCommand<null> {
    streamName: string;
  }

  export interface GetStreamLengthCommand extends ActionCommand {
    streamId: number;
  }

  export interface GetMovLenCommand extends ActionCommand {
    streamId: number;
  }

  export interface FCPublishCommand extends ActionCommand<null> {
    streamName: string;
  }

  export interface FCUnpublishCommand extends ActionCommand<null> {
    streamName: string;
  }

  export interface FCSubscribeCommand extends ActionCommand {
    streamName: string;
  }

  interface ConnectionCommandObj {
    app: string;
    type: string;
    flashVer: string;
    swfUrl: string;
    tcUrl: string;
    objectEncoding?: number;
  }

  export interface ConnectCommand extends ActionCommand<ConnectionCommandObj> {
    args: any;
  }

  export interface CallCommand extends ActionCommand {
    args: any;
  }

  export interface CreateStreamCommand extends ActionCommand<null> {}

  export interface CloseCommand extends ActionCommand {}

  export interface PlayCommand extends ActionCommand {
    streamName: string;
    start: number;
    duration: number;
    reset: boolean;
  }

  export interface Play2Command extends ActionCommand {
    params: any;
  }

  export interface DeleteStreamCommand extends ActionCommand<null> {
    streamId: number;
  }

  export interface CloseStreamCommand extends ActionCommand {
    streamId: number;
  }

  export interface ReceiveAudioCommand extends ActionCommand {
    bool: boolean;
  }

  export interface ReceiveVideoCommand extends ActionCommand {
    bool: boolean;
  }

  export interface PublishCommand extends ActionCommand<null> {
    streamName: string;
    type: string;
  }

  export interface SeekCommand extends ActionCommand {
    ms: number;
  }

  export interface PauseCommand extends ActionCommand {
    pause: boolean;
    ms: number;
  }

  export function decodeAmf0Cmd<T extends ActionCommand = ActionCommand>(buffer: Buffer): T;
  export function encodeAmf0Cmd(opt: ActionCommand): Buffer;

  export interface DataMessage<T = any> {
    cmd: string;
    dataObj: T;
  }
  export interface SetDataFrameObject {
    audiosamplerate: number;
    stereo: number;
    width: number;
    height: number;
    framerate: number;
  }
  export interface SetDataFrameMessage extends DataMessage<SetDataFrameObject> {}
  export function decodeAmf0Data<T extends DataMessage = DataMessage>(payload: Buffer): T;
  export function encodeAmf0Data(opt: DataMessage): Buffer;
}

export namespace AV {
  export const AUDIO_SOUND_RATE: number[];
  export const AUDIO_CODEC_NAME: string[];
  export const VIDEO_CODEC_NAME: string[];

  export interface ACCConfig {
    object_type: number;
    sample_rate: number;
    chan_config: number;
    channels: number;
    sbr: number;
    ps: number;
    ext_object_type: number;
  }

  export function readAACSpecificConfig(header: Buffer): ACCConfig;

  export function getAACProfileName(info: ACCConfig): string;

  export interface AVCConfig {
    width: number;
    height: number;
    profile: number;
    level: number;
    compat?: number;
    nalu?: number;
    nb_sps?: number;
    avc_ref_frames?: number;
  }

  export function readAVCSpecificConfig(header: Buffer): AVCConfig;

  export function getAVCProfileName(info: AVCConfig): string;
}

export namespace Hash {
  export function make(str: string, algo?: 'sha256' | 'md5'): string;
  export function compare(plain: string, hash: string, algo?: 'sha256' | 'md5'): boolean;
}

export namespace Random {
  export function name(length?: number): string;
  export function token(length?: number): string;
}
