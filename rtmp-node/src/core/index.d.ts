import { LogFn } from 'pino';
import { EventEmitter } from 'stream';
import { RtmpSession } from '../rtmp';

export declare class Logger {
  constructor(name: string);
  constructor(ctx: Record<string, any>);
  warn: LogFn;
  info: LogFn;
  error: LogFn;
  debug: LogFn;
}

export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}

export type InjectionToken<T = any> = string | Type<T>;

export interface ValueProvider<T = any> {
  provide: InjectionToken<T>;
  useValue: T;
}

export interface FactoryProvider<T = any> {
  provide: InjectionToken<T>;
  inject?: InjectionToken[];
  useFactory: (...args: any[]) => T;
}

export type Provider<T = any> = ValueProvider<T> | FactoryProvider<T>;

declare class Context extends EventEmitter {
  readonly sessions: Map<string, RtmpSession>;
  readonly publishers: Map<string, string>;
  readonly stats: { inbytes: number; outbytes: number; accepted: number };

  /**
   * Check if is there any RTMP session has stream path
   *
   * @param path RTMP stream path
   */
  hasPublisher(path: string): boolean;
  /**
   * Add mapping between stream path and RTMP session ID
   *
   * @param path RTMP stream path
   * @param id RTMP session ID
   */
  putPublisher(path: string, id: string): void;
  /**
   * Get RTMP session ID base on stream path
   *
   * @param path RTMP stream path
   * @return RTMP session ID
   */
  getPublisherID(path: string): string | undefined;
  /**
   * @param path RTMP stream path
   */
  removePublisher(path: string): boolean;

  get<TInput = any, TResult = TInput>(token: string | Type<TInput>): TResult;

  flushSessions(): void;

  putSession(sessionID: string, session: RtmpSession): void;

  getSession(sessionID: string): RtmpSession | undefined;

  removeSession(sessionID: string): boolean;

  generateSessionID(length?: number): string;
}

interface Context extends EventEmitter {
  on(event: 'pre-connect', listener: (id: string, args: Record<string, any>) => void): this;
  on(event: 'post-connect', listener: (id: string, args: Record<string, any>) => void): this;
  on(event: 'done-connect', listener: (id: string, args: Record<string, any>) => void): this;

  on(event: 'pre-publish', listener: (id: string, path: string, args: Record<string, any>) => void): this;
  on(event: 'post-publish', listener: (id: string, path: string, args: Record<string, any>) => void): this;
  on(event: 'done-publish', listener: (id: string, path: string, args: Record<string, any>) => void): this;

  on(event: 'pre-play', listener: (id: string, path: string, args: Record<string, any>) => void): this;
  on(event: 'post-play', listener: (id: string, path: string, args: Record<string, any>) => void): this;
  on(event: 'done-play', listener: (id: string, path: string, args: Record<string, any>) => void): this;

  on(event: string, listener: (...args: any[]) => void): this;
}
export const AppContext: Context;

export declare class MediaApplication {
  readonly logger: Logger;
  register(providers: Provider[]): void;
  run(): Promise<void>;
  stop(): Promise<void>;
}

export interface MediaApplication {
  on(event: 'pre-connect', listener: (id: string, args: Record<string, any>) => void): void;
  on(event: 'post-connect', listener: (id: string, args: Record<string, any>) => void): void;
  on(event: 'done-connect', listener: (id: string, args: Record<string, any>) => void): void;

  on(event: 'pre-publish', listener: (id: string, path: string, args: Record<string, any>) => void): void;
  on(event: 'post-publish', listener: (id: string, path: string, args: Record<string, any>) => void): void;
  on(event: 'done-publish', listener: (id: string, path: string, args: Record<string, any>) => void): void;

  on(event: 'pre-play', listener: (id: string, path: string, args: Record<string, any>) => void): void;
  on(event: 'post-play', listener: (id: string, path: string, args: Record<string, any>) => void): void;
  on(event: 'done-play', listener: (id: string, path: string, args: Record<string, any>) => void): void;

  on(event: string, listener: (...args: any[]) => void): void;
}
