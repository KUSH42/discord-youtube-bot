/**
 * Abstract HTTP service interface
 * Defines the contract for HTTP operations that can be mocked in tests
 */
export class HttpService {
  /**
   * Make a GET request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async get(url, options = {}) {
    throw new Error('Abstract method: get must be implemented');
  }

  /**
   * Make a POST request
   * @param {string} url - Request URL
   * @param {*} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async post(url, data = null, options = {}) {
    throw new Error('Abstract method: post must be implemented');
  }

  /**
   * Make a PUT request
   * @param {string} url - Request URL
   * @param {*} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async put(url, data = null, options = {}) {
    throw new Error('Abstract method: put must be implemented');
  }

  /**
   * Make a DELETE request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async delete(url, options = {}) {
    throw new Error('Abstract method: delete must be implemented');
  }

  /**
   * Make a PATCH request
   * @param {string} url - Request URL
   * @param {*} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async patch(url, data = null, options = {}) {
    throw new Error('Abstract method: patch must be implemented');
  }

  /**
   * Make a HEAD request
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async head(url, options = {}) {
    throw new Error('Abstract method: head must be implemented');
  }

  /**
   * Make a generic HTTP request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {*} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async request(method, url, data = null, options = {}) {
    throw new Error('Abstract method: request must be implemented');
  }

  /**
   * Download a file
   * @param {string} url - File URL
   * @param {string} destination - Local destination path
   * @param {Object} options - Download options
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadFile(url, destination, options = {}) {
    throw new Error('Abstract method: downloadFile must be implemented');
  }

  /**
   * Upload a file
   * @param {string} url - Upload URL
   * @param {string|Buffer} file - File path or buffer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Response object
   */
  async uploadFile(url, file, options = {}) {
    throw new Error('Abstract method: uploadFile must be implemented');
  }

  /**
   * Set default headers for all requests
   * @param {Object} headers - Default headers
   */
  setDefaultHeaders(headers) {
    throw new Error('Abstract method: setDefaultHeaders must be implemented');
  }

  /**
   * Set default timeout for all requests
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(timeout) {
    throw new Error('Abstract method: setTimeout must be implemented');
  }

  /**
   * Set base URL for relative requests
   * @param {string} baseUrl - Base URL
   */
  setBaseUrl(baseUrl) {
    throw new Error('Abstract method: setBaseUrl must be implemented');
  }

  /**
   * Add request interceptor
   * @param {Function} interceptor - Request interceptor function
   * @returns {Function} Remove interceptor function
   */
  addRequestInterceptor(interceptor) {
    throw new Error('Abstract method: addRequestInterceptor must be implemented');
  }

  /**
   * Add response interceptor
   * @param {Function} interceptor - Response interceptor function
   * @returns {Function} Remove interceptor function
   */
  addResponseInterceptor(interceptor) {
    throw new Error('Abstract method: addResponseInterceptor must be implemented');
  }

  /**
   * Create a new HTTP client instance with custom configuration
   * @param {Object} config - Client configuration
   * @returns {HttpService} New HTTP service instance
   */
  createInstance(config = {}) {
    throw new Error('Abstract method: createInstance must be implemented');
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   */
  validateUrl(url) {
    if (typeof url !== 'string') {
      return false;
    }

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build query string from object
   * @param {Object} params - Query parameters
   * @returns {string} Query string
   */
  buildQueryString(params) {
    if (!params || typeof params !== 'object') {
      return '';
    }

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, v));
        } else {
          searchParams.append(key, value);
        }
      }
    }

    return searchParams.toString();
  }

  /**
   * Join URL path segments
   * @param {...string} segments - Path segments
   * @returns {string} Joined path
   */
  joinUrlPath(...segments) {
    return segments
      .filter((segment) => segment)
      .map((segment) => segment.toString().replace(/^\/+|\/+$/g, ''))
      .join('/');
  }

  /**
   * Check if response indicates success
   * @param {Object} response - Response object
   * @returns {boolean} True if successful response
   */
  isSuccessResponse(response) {
    return response && response.status >= 200 && response.status < 300;
  }

  /**
   * Check if response indicates client error
   * @param {Object} response - Response object
   * @returns {boolean} True if client error response
   */
  isClientError(response) {
    return response && response.status >= 400 && response.status < 500;
  }

  /**
   * Check if response indicates server error
   * @param {Object} response - Response object
   * @returns {boolean} True if server error response
   */
  isServerError(response) {
    return response && response.status >= 500 && response.status < 600;
  }

  /**
   * Get content type from response
   * @param {Object} response - Response object
   * @returns {string|null} Content type or null
   */
  getContentType(response) {
    if (!response || !response.headers) {
      return null;
    }

    const contentType = response.headers['content-type'] || response.headers['Content-Type'];
    return contentType ? contentType.split(';')[0].trim() : null;
  }

  /**
   * Check if response is JSON
   * @param {Object} response - Response object
   * @returns {boolean} True if JSON response
   */
  isJsonResponse(response) {
    const contentType = this.getContentType(response);
    return contentType === 'application/json';
  }

  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  async dispose() {
    // No resources to dispose by default
  }
}
