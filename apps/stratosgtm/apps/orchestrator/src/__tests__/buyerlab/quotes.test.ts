import { normalizeText, verifyQuote, MIN_QUOTE_CHARS } from '../../buyerlab/quotes';

const source = 'Veloce replaces six tools.\n\n  Pricing is by \u201Csigned proposal\u201D only \u2014 talk to us.';

describe('quote verification', () => {
  it('normalises whitespace and typographic marks', () => {
    expect(normalizeText('a  b\n\nc')).toBe('a b c');
    // Test multiple mapped characters: U+201C, U+201D, U+2019, U+2014
    expect(normalizeText('\u201Chi\u201D \u2014 it\u2019s')).toBe('"hi" - it\'s');
  });

  it('normalises left single quotation mark (U+2018)', () => {
    expect(normalizeText('\u2018word')).toBe("'word");
  });

  it('normalises right single quotation mark (U+2019)', () => {
    expect(normalizeText('word\u2019s')).toBe("word's");
  });

  it('normalises left double quotation mark (U+201C)', () => {
    expect(normalizeText('\u201Cquote')).toBe('"quote');
  });

  it('normalises right double quotation mark (U+201D)', () => {
    expect(normalizeText('quote\u201D')).toBe('quote"');
  });

  it('normalises en-dash (U+2013)', () => {
    expect(normalizeText('1\u20132')).toBe('1-2');
  });

  it('normalises em-dash (U+2014)', () => {
    expect(normalizeText('yes\u2014no')).toBe('yes-no');
  });

  it('normalises non-breaking space (U+00A0)', () => {
    expect(normalizeText('a\u00A0b')).toBe('a b');
  });

  it('accepts a verbatim quote across line breaks and smart quotes', () => {
    expect(verifyQuote('Veloce replaces six tools. Pricing is by \u201Csigned proposal\u201D only', source)).toBe(true);
  });

  it('rejects a paraphrase', () => {
    expect(verifyQuote('Veloce replaces six different tools', source)).toBe(false);
  });

  it('rejects a quote that is too short to mean anything', () => {
    expect('the'.length).toBeLessThan(MIN_QUOTE_CHARS);
    expect(verifyQuote('the', 'the quick brown fox')).toBe(false);
  });

  it('is case sensitive, so a re-cased quote is not verbatim', () => {
    expect(verifyQuote('VELOCE REPLACES SIX TOOLS.', source)).toBe(false);
  });

  it('rejects empty input', () => {
    expect(verifyQuote('', source)).toBe(false);
    expect(verifyQuote('Veloce replaces six tools.', '')).toBe(false);
  });

  it('rejects a divider made of hyphens, even though it appears in the source', () => {
    const divider = '----------------';
    const sourceWithDivider = 'Section one.\n\n' + divider + '\n\nSection two.';
    expect(sourceWithDivider).toContain(divider);
    expect(divider.length).toBeGreaterThanOrEqual(12);
    expect(verifyQuote(divider, sourceWithDivider)).toBe(false);
  });

  it('rejects a divider made of em-dashes normalised to hyphens', () => {
    const divider = '————————————————';
    const sourceWithDivider = 'Section one.\n\n' + divider + '\n\nSection two.';
    expect(divider.length).toBeGreaterThanOrEqual(12);
    expect(verifyQuote(divider, sourceWithDivider)).toBe(false);
  });

  it('rejects a mixed punctuation divider with no alphanumeric chars', () => {
    const divider = '.......... ------';
    const sourceWithDivider = 'Content\n\n' + divider + '\n\nMore content.';
    expect(sourceWithDivider).toContain(divider);
    expect(verifyQuote(divider, sourceWithDivider)).toBe(false);
  });

  it('accepts a quote with 6+ alphanumeric characters even if padded with punctuation', () => {
    const source2 = 'no free plan is available for all users';
    expect(verifyQuote('no free plan', source2)).toBe(true);
  });

  it('rejects a quote with only 5 alphanumeric chars padded to 12+ total length', () => {
    const source2 = 'hello!!!!!!!!!';
    expect(verifyQuote('hello!!!!!!!!!', source2)).toBe(false);
  });
});
