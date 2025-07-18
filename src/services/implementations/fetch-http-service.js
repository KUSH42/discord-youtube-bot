import { HttpService } from '../interfaces/http-service.js';
import fs from 'fs';
import path from 'path';

/**
 * Fetch-based implementation of HttpService
 */
export class FetchHttpService extends HttpService {
  constructor(options = {}) {
    super();
    this.defaultHeaders = options.headers || {};
    this.timeout = options.timeout || 30000;
    this.baseUrl = options.baseUrl || '';
    this.requestInterceptors = [];
    this.responseInterceptors = [];
  }

  /**
   * Make a GET request
   */
  async get(url, options = {}) {
    return this.request('GET', url, null, options);
  }

  /**
   * Make a POST request
   */
  async post(url, data = null, options = {}) {
    return this.request('POST', url, data, options);
  }

  /**
   * Make a PUT request
   */
  async put(url, data = null, options = {}) {
    return this.request('PUT', url, data, options);
  }

  /**
   * Make a DELETE request
   */
  async delete(url, options = {}) {
    return this.request('DELETE', url, null, options);
  }

  /**
   * Make a PATCH request
   */
  async patch(url, data = null, options = {}) {
    return this.request('PATCH', url, data, options);
  }

  /**
   * Make a HEAD request
   */
  async head(url, options = {}) {
    return this.request('HEAD', url, null, options);
  }

  /**
   * Make a generic HTTP request
   */
  async request(method, url, data = null, options = {}) {
    try {
      // Build full URL
      const fullUrl = this.buildFullUrl(url);

      // Prepare request options
      const requestOptions = {
        method: method.toUpperCase(),
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        signal: this.createAbortSignal(options.timeout),
      };

      // Add body for non-GET requests
      if (data !== null && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        if (typeof data === 'string') {
          requestOptions.body = data;
        } else if (data instanceof FormData) {
          requestOptions.body = data;
        } else if (data instanceof URLSearchParams) {
          requestOptions.body = data.toString();
          if (!requestOptions.headers['content-type']) {
            requestOptions.headers['content-type'] = 'application/x-www-form-urlencoded';
          }
        } else {
          requestOptions.body = JSON.stringify(data);
          if (!requestOptions.headers['content-type']) {
            requestOptions.headers['content-type'] = 'application/json';
          }
        }
      }

      // Apply request interceptors
      for (const interceptor of this.requestInterceptors) {
        await interceptor(requestOptions);
      }

      // Make the request
      const response = await fetch(fullUrl, requestOptions);

      // Create response object
      const responseObj = {
        status: response.status,
        statusText: response.statusText,
        headers: this.headersToObject(response.headers),
        url: response.url,
        ok: response.ok,
      };

      // Add response data
      const contentType = this.getContentType(responseObj);
      if (contentType === 'application/json') {
        try {
          responseObj.data = await response.json();
        } catch {
          responseObj.data = await response.text();
        }
      } else {
        responseObj.data = await response.text();
      }

      // Apply response interceptors
      for (const interceptor of this.responseInterceptors) {
        await interceptor(responseObj);
      }

      return responseObj;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  /**
   * Download a file
   */
  async downloadFile(url, destination, options = {}) {
    try {
      const response = await this.get(url, options);

      if (!this.isSuccessResponse(response)) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      // Ensure directory exists
      const dir = path.dirname(destination);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(destination, response.data);

      return destination;
    } catch (error) {
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(url, file, options = {}) {
    try {
      let formData = new FormData();

      if (typeof file === 'string') {
        // File path
        const fileBuffer = fs.readFileSync(file);
        const fileName = path.basename(file);
        formData.append('file', new Blob([fileBuffer]), fileName);
      } else if (Buffer.isBuffer(file)) {
        // Buffer
        formData.append('file', new Blob([file]), options.fileName || 'file');
      } else {
        // Assume it's already a File or Blob
        formData.append('file', file);
      }

      // Add additional form fields
      if (options.fields) {
        for (const [key, value] of Object.entries(options.fields)) {
          formData.append(key, value);
        }
      }

      return await this.post(url, formData, {
        ...options,
        headers: {
          ...options.headers,
          // Don't set content-type for FormData, let browser set it
        },
      });
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Set default headers for all requests
   */
  setDefaultHeaders(headers) {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Set default timeout for all requests
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }

  /**
   * Set base URL for relative requests
   */
  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);

    // Return remove function
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);

    // Return remove function
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Create a new HTTP client instance with custom configuration
   */
  createInstance(config = {}) {
    return new FetchHttpService({
      headers: { ...this.defaultHeaders, ...config.headers },
      timeout: config.timeout || this.timeout,
      baseUrl: config.baseUrl || this.baseUrl,
    });
  }

  /**
   * Build full URL from base URL and relative path
   */
  buildFullUrl(url) {
    if (this.validateUrl(url)) {
      return url; // Already a full URL
    }

    if (!this.baseUrl) {
      return url;
    }

    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const path = url.startsWith('/') ? url : `/${url}`;

    return `${base}${path}`;
  }

  /**
   * Create abort signal for timeout
   */
  createAbortSignal(timeout) {
    const timeoutMs = timeout || this.timeout;
    const controller = new AbortController();

    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return controller.signal;
  }

  /**
   * Convert Headers object to plain object
   */
  headersToObject(headers) {
    const obj = {};
    for (const [key, value] of headers.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}
