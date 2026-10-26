import { describe, expect, it, vi } from 'vitest';
import { JournalWorkers } from './journal-workers';

class Port {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  emit(data: unknown) {
    this.onmessage?.call(
      this as unknown as Worker,
      new MessageEvent('message', { data }),
    );
  }
  crash() {
    this.onerror?.call(this as unknown as Worker, {} as ErrorEvent);
  }
}
function setup() {
  const ports: Port[] = [];
  const create = vi.fn(() => {
    const port = new Port();
    ports.push(port);
    return port as unknown as Worker;
  });
  const receive = vi.fn(),
    failed = vi.fn();
  const workers = new JournalWorkers(create, receive, failed);
  const load = (id: number) => {
    workers.load({ type: 'load', id, sources: [] });
    return ports.at(-1)!;
  };
  return { ports, create, receive, failed, workers, load };
}

describe('staged journal workers', () => {
  it('retains the committed worker until a matching replacement finishes', () => {
    const { load, workers, receive } = setup();
    const first = load(1);
    first.emit({ type: 'loaded', id: 1 });
    const second = load(2);
    second.emit({ type: 'loaded', id: 999 });
    second.emit({ type: 'report', id: 2 });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(first.terminate).not.toHaveBeenCalled();
    workers.postMessage({ type: 'detail', id: 7 });
    expect(first.postMessage).toHaveBeenLastCalledWith({
      type: 'detail',
      id: 7,
    });
    second.emit({ type: 'progress', id: 2, progress: { phase: 'processing' } });
    expect(receive.mock.lastCall?.[0].data.type).toBe('progress');
    second.emit({ type: 'loaded', id: 2 });
    expect(first.terminate).toHaveBeenCalledOnce();
    workers.postMessage({ type: 'detail', id: 8 });
    expect(second.postMessage).toHaveBeenLastCalledWith({
      type: 'detail',
      id: 8,
    });
    first.emit({ type: 'report', id: 123 });
    expect(receive.mock.lastCall?.[0].data.type).toBe('loaded');
  });
  it('terminates cancellation immediately and ignores every late candidate reply', () => {
    const { load, workers, receive, failed } = setup();
    const first = load(1);
    first.emit({ type: 'loaded', id: 1 });
    const second = load(2);
    expect(workers.cancel()).toBe(true);
    expect(second.terminate).toHaveBeenCalledOnce();
    for (const type of ['progress', 'loaded', 'error', 'report'])
      second.emit({ type, id: 2 });
    second.crash();
    expect(receive).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(workers.cancel()).toBe(false);
    expect(first.terminate).not.toHaveBeenCalled();
    workers.postMessage({ type: 'detail', id: 7 });
    expect(first.postMessage).toHaveBeenLastCalledWith({
      type: 'detail',
      id: 7,
    });
  });
  it('supersedes unfinished replacements without accumulating live workers', () => {
    const { load, receive } = setup();
    const first = load(1);
    first.emit({ type: 'loaded', id: 1 });
    const second = load(2),
      third = load(3);
    expect(second.terminate).toHaveBeenCalledOnce();
    second.emit({ type: 'loaded', id: 2 });
    third.emit({ type: 'loaded', id: 3 });
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(receive.mock.lastCall?.[0].data.id).toBe(3);
    expect(third.terminate).not.toHaveBeenCalled();
  });
  it.each(['error', 'crash'])(
    'preserves the old worker after a candidate %s and permits retry',
    (failure) => {
      const { load, receive, failed } = setup();
      const first = load(1);
      first.emit({ type: 'loaded', id: 1 });
      const second = load(2);
      if (failure === 'error')
        second.emit({ type: 'error', id: 2, message: 'Cannot decode' });
      else second.crash();
      expect(second.terminate).toHaveBeenCalledOnce();
      expect(first.terminate).not.toHaveBeenCalled();
      expect(receive.mock.lastCall?.[0].data).toMatchObject({
        type: 'error',
        id: 2,
      });
      expect(failed).not.toHaveBeenCalled();
      load(3).emit({ type: 'loaded', id: 3 });
      expect(first.terminate).toHaveBeenCalledOnce();
    },
  );
  it.each(['create', 'post'])(
    'recovers from a synchronous %s failure without losing the open journal',
    (failure) => {
      const { load, create, workers, receive } = setup();
      const first = load(1);
      first.emit({ type: 'loaded', id: 1 });
      const broken = new Port();
      create.mockImplementationOnce(() => {
        if (failure === 'create') throw new Error('Cannot create');
        broken.postMessage.mockImplementation(() => {
          throw new Error('Cannot clone');
        });
        return broken as unknown as Worker;
      });
      workers.load({ type: 'load', id: 2, sources: [] });
      expect(first.terminate).not.toHaveBeenCalled();
      expect(receive.mock.lastCall?.[0].data).toMatchObject({
        type: 'error',
        id: 2,
      });
      expect(workers.cancel()).toBe(false);
      if (failure === 'post') expect(broken.terminate).toHaveBeenCalledOnce();
    },
  );
  it('disposes both workers and drops already queued replies', () => {
    const { load, workers, receive, failed } = setup();
    const first = load(1);
    first.emit({ type: 'loaded', id: 1 });
    const second = load(2);
    workers.dispose();
    workers.dispose();
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(second.terminate).toHaveBeenCalledOnce();
    first.emit({ type: 'report', id: 1 });
    second.emit({ type: 'loaded', id: 2 });
    first.crash();
    second.crash();
    expect(receive).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });
  it('cleans up a pending replacement when the active worker fails', () => {
    const { load, failed } = setup();
    const first = load(1);
    first.emit({ type: 'loaded', id: 1 });
    const second = load(2);
    first.crash();
    first.crash();
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(second.terminate).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
  });
});
