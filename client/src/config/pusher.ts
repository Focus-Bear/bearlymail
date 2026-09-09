import axios from 'axios';
import Pusher from 'pusher-js';

import { API_URL } from 'config/api';

let pusherInstance: Pusher | null = null;

/** Endpoint that signs a subscription to a `private-` channel. */
export const PUSHER_AUTH_ENDPOINT = `${API_URL}/pusher/auth`;

/**
 * Authorizes private-channel subscriptions through axios rather than pusher-js's
 * built-in ajax transport. The app authenticates with an HttpOnly cookie and the
 * built-in transport never sets `withCredentials`, so it would send the auth
 * request unauthenticated and every subscription would fail.
 */
function authorizeChannel(
  params: { socketId: string; channelName: string },
  callback: (error: Error | null, authData: { auth: string } | null) => void
): void {
  axios
    .post<{ auth: string }>(PUSHER_AUTH_ENDPOINT, {
      socket_id: params.socketId,
      channel_name: params.channelName,
    })
    .then(response => callback(null, response.data))
    .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null));
}

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
    channelAuthorization: { customHandler: authorizeChannel },
  });

  return pusherInstance;
}
