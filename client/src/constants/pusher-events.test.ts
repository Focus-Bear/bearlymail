import { PUSHER_PRIVATE_CHANNEL_PREFIX, userChannel } from './pusher-events';

describe('userChannel', () => {
  it('names a private channel, so Pusher requires authorization to subscribe', () => {
    expect(userChannel('abc')).toBe('private-user-abc');
    expect(userChannel('abc').startsWith(PUSHER_PRIVATE_CHANNEL_PREFIX)).toBe(true);
  });

  it('gives different users different channels', () => {
    expect(userChannel('a')).not.toBe(userChannel('b'));
  });
});
