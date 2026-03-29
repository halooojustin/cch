export interface ActiveSession {
  name: string;
  created: string;
  status: "running" | "exited";
}

export interface CreateSessionOpts {
  name: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface SessionBackend {
  name: string;
  isAvailable(): boolean;
  listSessions(): ActiveSession[];
  createSession(opts: CreateSessionOpts): void;
  attachSession(name: string): void;
  killSession(name: string): void;
}
