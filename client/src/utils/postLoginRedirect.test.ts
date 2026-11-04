import { clearPostLoginPath, peekPostLoginPath, rememberPostLoginPath } from './postLoginRedirect';

describe('postLoginRedirect', () => {
  beforeEach(() => sessionStorage.clear());

  it('remembers an in-app path until it is cleared', () => {
    rememberPostLoginPath('/oauth/consent?request=abc');
    expect(peekPostLoginPath()).toBe('/oauth/consent?request=abc');
    expect(peekPostLoginPath()).toBe('/oauth/consent?request=abc');
    clearPostLoginPath();
    expect(peekPostLoginPath()).toBeNull();
  });

  it.each(['https://evil.example/', '//evil.example/x', '/\\evil.example'])('never stores an off-site target (%s)', path => {
    rememberPostLoginPath(path);
    expect(peekPostLoginPath()).toBeNull();
  });
});
