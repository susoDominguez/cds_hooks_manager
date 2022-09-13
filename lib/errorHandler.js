class ErrorHandler extends Error {
  /**
   * 
   * @param {number} statusCode status code
   * @param {String} message message
   */
    constructor(statusCode, message) {
      super();
      this.statusCode = statusCode;
      this.message = message;
    }
  }

  const handleError = (err, res) => {
    const { statusCode, message } =  err ;
    let msg = message ? message : 'undefined message';
    res.status( statusCode || 500).json({
      status: "error",
      statusCode,
      message: msg
    });
  };

  export {
    ErrorHandler,
    handleError
  };