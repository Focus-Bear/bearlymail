import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function getPusherInstance(): Pusher | null {
  if (pusherInstance) {
    return pusherInstance;
  }

  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

  if (!key || !cluster) {
    return null;
  }

  pusherInstance = new Pusher(key, {
    cluster,
  });

  return pusherInstance;
}
