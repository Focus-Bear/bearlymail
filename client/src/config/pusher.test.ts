import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as unknown as { post: ReturnType<typeof vi.fn> };

const constructorCalls: { key: string; options: Record<string, unknown> }[] = [];
vi.mock('pusher-js', () => ({
  default: class {
    constructor(key: string, options: Record<string, unknown>) {
      constructorCalls.push({ key, options });
    }
  },
}));

type AuthHandler = (
  params: { socketId: string; channelName: string },
  callback: (error: Error | null, data: { auth: string } | null) => void
) => void;

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  constructorCalls.length = 0;
  vi.stubEnv('VITE_PUSHER_KEY', env.VITE_PUSHER_KEY ?? '');
  vi.stubEnv('VITE_PUSHER_CLUSTER', env.VITE_PUSHER_CLUSTER ?? '');
  return import('./pusher');
}

describe('getPusherInstance', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when Pusher is not configured, so callers degrade quietly', async () => {
    const { getPusherInstance } = await loadConfig({});
    expect(getPusherInstance()).toBeNull();
    expect(constructorCalls).toHaveLength(0);
  });

  it('builds an instance with a channel authorizer when configured', async () => {
    const { getPusherInstance } = await loadConfig({
      VITE_PUSHER_KEY: 'test-key',
      VITE_PUSHER_CLUSTER: 'ap4',
    });

    expect(getPusherInstance()).not.toBeNull();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].key).toBe('test-key');
    expect(constructorCalls[0].options.cluster).toBe('ap4');
    expect(constructorCalls[0].options.channelAuthorization).toEqual({
      customHandler: expect.any(Function),
    });
  });

  it('reuses one instance across calls', async () => {
    const { getPusherInstance } = await loadConfig({
      VITE_PUSHER_KEY: 'test-key',
      VITE_PUSHER_CLUSTER: 'ap4',
    });

    expect(getPusherInstance()).toBe(getPusherInstance());
    expect(constructorCalls).toHaveLength(1);
  });

  it('authorizes over axios so the HttpOnly auth cookie is sent', async () => {
    const { getPusherInstance, PUSHER_AUTH_ENDPOINT } = await loadConfig({
      VITE_PUSHER_KEY: 'test-key',
      VITE_PUSHER_CLUSTER: 'ap4',
    });
    getPusherInstance();
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { auth: 'key:sig' } });

    const authorize = constructorCalls[0].options.channelAuthorization as {
      customHandler: AuthHandler;
    };
    const callback = vi.fn();
    authorize.customHandler({ socketId: '1.2', channelName: 'private-user-u1' }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());

    expect(mockedAxios.post).toHaveBeenCalledWith(PUSHER_AUTH_ENDPOINT, {
      socket_id: '1.2',
      channel_name: 'private-user-u1',
    });
    expect(callback).toHaveBeenCalledWith(null, { auth: 'key:sig' });
  });

  it('reports an authorization failure to Pusher instead of faking success', async () => {
    const { getPusherInstance } = await loadConfig({
      VITE_PUSHER_KEY: 'test-key',
      VITE_PUSHER_CLUSTER: 'ap4',
    });
    getPusherInstance();
    mockedAxios.post = vi.fn().mockRejectedValue(new Error('403'));

    const authorize = constructorCalls[0].options.channelAuthorization as {
      customHandler: AuthHandler;
    };
    const callback = vi.fn();
    authorize.customHandler({ socketId: '1.2', channelName: 'private-user-u1' }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());

    expect(callback).toHaveBeenCalledWith(expect.any(Error), null);
  });
});
