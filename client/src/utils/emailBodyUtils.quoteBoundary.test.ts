import { extractCleanBodyWithMeta, extractCleanHtmlBodyWithMeta, findQuoteBoundary } from './emailBodyUtils';

/**
 * Shapes taken from a real BearlyMail-sent reply (names and addresses
 * anonymised): the composer's HTML reply, BearlyMail's own
 * "On <UTC date>, Name <addr> wrote:" attribution, and the stored copy of the
 * sent mail, whose `body` is the plain-text part with the reply's <p> left in.
 */
const SHORT_REPLY = 'Thanks Priya.';
const ATTRIBUTION = 'On Mon, 26 Oct 2026 02:52:50 GMT, Priya &lt;priya.student@example.com&gt; wrote:';
const QUOTED_TEXT = 'Sorry for the delay in getting back to you.';

const SENT_REPLY_HTML =
  `<p>${SHORT_REPLY}</p><br><blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex">` +
  `<div>${ATTRIBUTION}</div><div dir="ltr">Hi,<div><br>${QUOTED_TEXT}</div>` +
  '<div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">' +
  'On Mon, Oct 26, 2026 at 12:20 PM Sam Lee &lt;<a href="mailto:sam@example.com">sam@example.com</a>&gt; wrote:<br></div>' +
  '<blockquote class="gmail_quote"><p>Hi Priya,</p><p>Were you able to work on this?</p></blockquote></div></div></blockquote>';

const STORED_SENT_BODY =
  `<p>${SHORT_REPLY}</p>\n\n` +
  'On Mon, 26 Oct 2026 02:52:50 GMT, Priya <priya.student@example.com> wrote:\n' +
  `> Hi,\n>\n> ${QUOTED_TEXT}\n>\n> On Mon, Oct 26, 2026 at 12:20 PM Sam Lee <sam@example.com> wrote:\n>\n> > Hi Priya,\n` +
  '\n--\nSent from BearlyMail (anti inbox overwhelm system)';

describe('quoted-reply collapsing for a short reply', () => {
  it('collapses the quote under a reply shorter than 20 characters (HTML part)', () => {
    const result = extractCleanHtmlBodyWithMeta(SENT_REPLY_HTML);

    expect(result.wasTruncated).toBe(true);
    expect(result.html).toContain(SHORT_REPLY);
    expect(result.html).not.toContain('wrote:');
    expect(result.html).not.toContain(QUOTED_TEXT);
  });

  it('collapses the quote in the stored sent copy, whose body is HTML-in-plain-text', () => {
    const htmlResult = extractCleanHtmlBodyWithMeta(STORED_SENT_BODY);
    expect(htmlResult.wasTruncated).toBe(true);
    expect(htmlResult.html).toContain(SHORT_REPLY);
    expect(htmlResult.html).not.toContain('wrote:');

    const textResult = extractCleanBodyWithMeta(STORED_SENT_BODY);
    expect(textResult).toEqual({ text: SHORT_REPLY, wasTruncated: true });
  });

  it('collapses under a one-word reply, shorter than the HTML search step', () => {
    const result = extractCleanHtmlBodyWithMeta(`<p>Thanks!</p>\n\n${ATTRIBUTION}\n> ${QUOTED_TEXT}`);

    expect(result.wasTruncated).toBe(true);
    expect(result.html).toContain('Thanks!');
    expect(result.html).not.toContain('wrote:');
  });

  it.each([
    ['a style block', 'no', '<html><head><style>a{text-decoration:none}</style></head><body><div>no</div>'],
    ['a style block in the body', 'ok', '<style>.ok{color:red}</style><div>ok</div>'],
    ['the page title', 'Thanks', '<html><head><title>Thanks</title></head><body><p>Thanks</p>'],
    ['an attribute', 'ok', '<table data-x="book"><tr><td>ok</td></tr></table>'],
  ])('keeps a very short reply visible when its text also appears in %s', (_place, reply, htmlBeforeQuote) => {
    const result = extractCleanHtmlBodyWithMeta(
      `${htmlBeforeQuote}<div>${ATTRIBUTION}</div><blockquote>${QUOTED_TEXT}</blockquote>`
    );

    const visibleText = new DOMParser().parseFromString(result.html, 'text/html').body.textContent;
    expect(result.wasTruncated).toBe(true);
    expect(visibleText).toContain(reply);
    expect(visibleText).not.toContain(QUOTED_TEXT);
  });

  it('leaves a message that is only a quote alone', () => {
    const quoteOnly = `${ATTRIBUTION.replace(/&lt;|&gt;/g, '')}\n> ${QUOTED_TEXT}`;

    expect(findQuoteBoundary(quoteOnly)).toBe(-1);
    expect(extractCleanHtmlBodyWithMeta(`<div>${quoteOnly}</div>`).wasTruncated).toBe(false);
  });
});

describe('findQuoteBoundary attribution shapes', () => {
  const REPLY = 'Sounds good.\n\n';

  it.each([
    ['Gmail day-first', 'On Mon, 26 Oct 2026 at 12:20, Sam Lee <sam@example.com> wrote:'],
    ['Gmail US month-first', 'On Mon, Oct 26, 2026 at 12:20 PM Sam Lee <sam@example.com> wrote:'],
    ['Apple day-first', 'On 26 Oct 2026, at 12:20, Sam Lee <sam@example.com> wrote:'],
    ['Apple month-first', 'On Oct 26, 2026, at 12:20 PM, Sam Lee <sam@example.com> wrote:'],
    ['numeric date', 'On 26/10/2026 12:20 pm, Sam Lee wrote:'],
    ['numeric short year', 'On 26/10/26 12:20, Sam Lee wrote:'],
    ['BearlyMail UTC', 'On Mon, 26 Oct 2026 02:52:50 GMT, Sam Lee <sam@example.com> wrote:'],
    ['wrapped onto two lines', 'On Mon, 26 Oct 2026 at 12:20, Sam Lee <\nsam@example.com> wrote:'],
    ['Spanish Gmail', 'El lun, 26 oct 2026 a las 12:20, Sam Lee (<sam@example.com>) escribió:'],
    ['German Gmail', 'Am Mo., 26. Okt. 2026 um 12:20 Uhr schrieb Sam Lee <sam@example.com>:'],
    ['French Gmail', 'Le lun. 26 oct. 2026 à 12:20, Sam Lee <sam@example.com> a écrit :'],
  ])('finds the %s attribution', (_shape, attribution) => {
    expect(findQuoteBoundary(`${REPLY}${attribution}\n> earlier`)).toBe(REPLY.length);
  });

  it('does not join an "On …" sentence to a "wrote:" several lines later', () => {
    const text = `${REPLY}On Mon, 26 Oct 2026 we met for coffee.\nIt went well.\nLater on\nshe wrote: thanks`;

    expect(findQuoteBoundary(text)).toBe(-1);
  });

  it('still needs real content above a forwarded header', () => {
    expect(findQuoteBoundary('FYI\n\n-----Original Message-----\nFrom: Sam')).toBe(-1);
    expect(findQuoteBoundary('Please see the thread below, thanks.\n\n-----Original Message-----')).toBeGreaterThan(0);
  });

  it('does not count blank lines as content above a forwarded header', () => {
    const forwarded = '-----Original Message-----\nFrom: Sam\nThe forwarded message';

    expect(findQuoteBoundary(`${'\n'.repeat(25)}${forwarded}`)).toBe(-1);
    expect(findQuoteBoundary(`FYI${'\r\n'.repeat(15)}${forwarded}`)).toBe(-1);
    expect(extractCleanBodyWithMeta(`${' '.repeat(30)}\n${forwarded}`).text).toContain('The forwarded message');
  });
});
