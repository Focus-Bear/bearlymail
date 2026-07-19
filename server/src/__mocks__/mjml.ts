/// <reference types="jest" />
const mjml = jest
  .fn()
  .mockReturnValue({ html: "<html><body></body></html>", errors: [] });

export default mjml;
