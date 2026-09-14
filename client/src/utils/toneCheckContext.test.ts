import { buildToneCheckContext, parseRecipientField } from './toneCheckContext';

describe('parseRecipientField', () => {
  it('parses named and bare addresses', () => {
    expect(parseRecipientField('Rob Smith <Rob@Acme.com>, sam@acme.com')).toEqual([
      { email: 'rob@acme.com', name: 'Rob Smith' },
      { email: 'sam@acme.com' },
    ]);
  });

  it('keeps a quoted display name containing a comma intact', () => {
    expect(parseRecipientField('"Smith, Rob" <rob@acme.com>; sam@acme.com')).toEqual([
      { email: 'rob@acme.com', name: 'Smith, Rob' },
      { email: 'sam@acme.com' },
    ]);
  });

  it('returns nothing for empty or unparsable input', () => {
    expect(parseRecipientField(undefined)).toEqual([]);
    expect(parseRecipientField('   ')).toEqual([]);
    expect(parseRecipientField('not-an-address')).toEqual([]);
  });
});

describe('buildToneCheckContext', () => {
  it('collects attached and forwarded filenames', () => {
    const context = buildToneCheckContext({
      files: [new File(['x'], 'payout.csv')],
      forwardedFilenames: ['contract.pdf'],
      recipientFields: ['Rob Smith <rob@acme.com>'],
    });

    expect(context.attachmentFilenames).toEqual(['payout.csv', 'contract.pdf']);
    expect(context.recipients).toEqual([{ email: 'rob@acme.com', name: 'Rob Smith' }]);
  });

  it('defaults to empty lists', () => {
    expect(buildToneCheckContext({})).toEqual({ attachmentFilenames: [], recipients: [] });
  });
});
