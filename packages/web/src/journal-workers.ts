import type { Request } from './journal.worker';

type LoadRequest = Extract<Request, { type: 'load' }>;

/** Stage replacements separately so terminating a parser cannot destroy the open journal. */
export class JournalWorkers {
  private active: Worker | null = null;
  private pending: { worker: Worker; id: number } | null = null;

  constructor(
    private readonly create: () => Worker,
    private readonly receive: (event: MessageEvent) => void,
    private readonly failed: () => void,
  ) {}

  postMessage(request: Request) {
    this.active?.postMessage(request);
  }

  load(request: LoadRequest) {
    // Event handlers retain only the ID, not selected File objects/source inputs.
    const id = request.id;
    this.cancel();
    let instance: Worker;
    try {
      instance = this.create();
    } catch {
      this.importFailed(id);
      return;
    }
    this.pending = { worker: instance, id };
    instance.onmessage = (event) => {
      if (this.pending?.worker === instance) {
        if (event.data.id !== id) return;
        if (event.data.type === 'loaded') {
          const previous = this.active;
          this.active = instance;
          this.pending = null;
          previous?.terminate();
        } else if (event.data.type === 'error') this.cancel();
        else if (event.data.type !== 'progress') return;
        this.receive(event);
      } else if (this.active === instance) this.receive(event);
    };
    instance.onerror = () => {
      if (this.pending?.worker === instance) {
        this.cancel();
        this.importFailed(id);
      } else if (this.active === instance) {
        this.dispose();
        this.failed();
      }
    };
    try {
      instance.postMessage(request);
    } catch {
      this.cancel();
      this.importFailed(id);
    }
  }

  private importFailed(id: number) {
    this.receive(
      new MessageEvent('message', {
        data: {
          type: 'error',
          id,
          code: 'processing',
          message:
            'Could not import these journals. Existing journals have not been replaced. Try importing again.',
        },
      }),
    );
  }

  cancel(): boolean {
    if (!this.pending) return false;
    const pending = this.pending;
    this.pending = null;
    pending.worker.terminate();
    return true;
  }

  dispose() {
    this.cancel();
    this.active?.terminate();
    this.active = null;
  }
}
