const { HttpStatus } = require("../constants");

class HttpError extends Error {
  static from(e) {
    if (e instanceof HttpError) {
      return e;
    }
    if (e instanceof Error) {
      const error = new HttpError(e.message, HttpStatus.IntervalServerError);
      error.stack = e.stack;
      return error;
    }
    return new HttpError(e, HttpStatus.IntervalServerError);
  }

  /**
   * @param {string} message
   * @param {number} code
   */
  constructor(message, code) {
    super(message);
    this.code = code;
  }

  toJSON(stack = false) {
    const obj = {
      code: this.code,
      message: this.message,
    };
    if (stack) {
      obj.stack = this.stack;
    }
    return obj;
  }
}

class BadRequestError extends HttpError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(message, HttpStatus.NotFound);
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(message, HttpStatus.Unauthorized);
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(message, HttpStatus.Forbidden);
  }
}

class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error') {
    super(message, HttpStatus.IntervalServerError);
  }
}

module.exports = { HttpError, BadRequestError, ForbiddenError, InternalServerError, NotFoundError, UnauthorizedError };
