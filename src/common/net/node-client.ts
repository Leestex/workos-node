import {
  HttpClient,
  HttpClientResponse,
  RequestHeaders,
  RequestOptions,
} from './http-client';
import {
  HttpClientInterface,
  HttpClientResponseInterface,
} from './http-client.interface';

import { RequestOptions as HttpRequestOptions, Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

import * as http_ from 'http';
import * as https_ from 'https';

// `import * as http_ from 'http'` creates a "Module Namespace Exotic Object"
// which is immune to monkey-patching, whereas http_.default (in an ES Module context)
// will resolve to the same thing as require('http'), which is
// monkey-patchable. We care about this because users in their test
// suites might be using a library like "nock" which relies on the ability
// to monkey-patch and intercept calls to http.request.
const http = (http_ as unknown as { default: typeof http_ }).default || http_;
const https =
  (https_ as unknown as { default: typeof https_ }).default || https_;

export class NodeHttpClient extends HttpClient implements HttpClientInterface {
  private httpAgent: HttpAgent;
  private httpsAgent: HttpsAgent;

  constructor(readonly baseURL: string, readonly options?: RequestInit) {
    super(baseURL, options);

    this.httpAgent = new http.Agent({ keepAlive: true });
    this.httpsAgent = new https.Agent({ keepAlive: true });
  }

  async get(
    path: string,
    options: RequestOptions,
  ): Promise<HttpClientResponseInterface> {
    const resourceURL = HttpClient.getResourceURL(
      this.baseURL,
      path,
      options.params,
    );

    return await this.nodeRequest(resourceURL, 'GET', null, options.headers);
  }

  async post<Entity = any>(
    path: string,
    entity: Entity,
    options: RequestOptions,
  ): Promise<HttpClientResponseInterface> {
    const resourceURL = HttpClient.getResourceURL(
      this.baseURL,
      path,
      options.params,
    );

    return await this.nodeRequest(
      resourceURL,
      'POST',
      HttpClient.getBody(entity),
      {
        ...HttpClient.getContentTypeHeader(entity),
        ...options.headers,
      },
    );
  }

  async put<Entity = any>(
    path: string,
    entity: Entity,
    options: RequestOptions,
  ): Promise<HttpClientResponseInterface> {
    const resourceURL = HttpClient.getResourceURL(
      this.baseURL,
      path,
      options.params,
    );

    return await this.nodeRequest(
      resourceURL,
      'PUT',
      HttpClient.getBody(entity),
      {
        ...HttpClient.getContentTypeHeader(entity),
        ...options.headers,
      },
    );
  }

  async delete(
    path: string,
    options: RequestOptions,
  ): Promise<HttpClientResponseInterface> {
    const resourceURL = HttpClient.getResourceURL(
      this.baseURL,
      path,
      options.params,
    );

    return await this.nodeRequest(resourceURL, 'DELETE', null, options.headers);
  }

  private async nodeRequest(
    url: string,
    method: string,
    body?: any,
    headers?: RequestHeaders,
  ): Promise<HttpClientResponseInterface> {
    return new Promise<HttpClientResponseInterface>((resolve, reject) => {
      const isSecureConnection = url.startsWith('https');
      const agent = isSecureConnection ? this.httpsAgent : this.httpAgent;
      const lib = isSecureConnection ? https : http;
      const options: HttpRequestOptions = {
        method,
        headers,
        agent,
      };

      const req = lib.request(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', (res) => {
          resolve(new NodeHttpClientResponse(res));
        });
      });

      req.on('error', (err) => reject(err));

      if (body) {
        const data = JSON.stringify(body);
        req.setHeader('Content-Length', Buffer.byteLength(data));
        req.write(data);
      }
      req.end();
    });
  }
}

export class NodeHttpClientResponse
  extends HttpClientResponse
  implements HttpClientResponseInterface
{
  _res: http_.IncomingMessage;

  constructor(res: http_.IncomingMessage) {
    // @ts-ignore
    super(res.statusCode, res.headers || {});
    this._res = res;
  }

  getRawResponse(): http_.IncomingMessage {
    return this._res;
  }

  toJSON(): any {
    return new Promise((resolve, reject) => {
      let response = '';

      this._res.setEncoding('utf8');
      this._res.on('data', (chunk) => {
        response += chunk;
      });
      this._res.once('end', () => {
        try {
          resolve(JSON.parse(response));
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}
