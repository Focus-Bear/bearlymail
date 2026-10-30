/// <reference types="jest" />
// mjml v5's mjml2html is async, so the mock resolves too: a mock that returned
// the result synchronously hid a missing `await` in EmailService.
const mjml = jest
  .fn()
  .mockResolvedValue({ html: "<html><body></body></html>", errors: [] });

export default mjml;
