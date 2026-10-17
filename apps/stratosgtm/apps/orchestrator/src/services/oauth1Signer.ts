import * as crypto from 'crypto';

/**
 * Minimal OAuth 1.0a request signer for Twitter/X API v2 JSON endpoints.
 * Only signs the oauth_* parameters (no form-encoded body params), which
 * is what Twitter's `POST /2/tweets` (a JSON body endpoint) expects.
 */
export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  tokenSecret: string;
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function buildOAuth1AuthHeader(method: string, url: string, creds: OAuth1Credentials): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0'
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
      .join(', ');

  return header;
}
