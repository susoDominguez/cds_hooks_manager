const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
var helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./config/winston');
const { handleError } = require('./lib/errorHandler');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
// Environment constiables
require('dotenv').config();
const cdsServicesRouter = require('./routes/cds-hooks-router.js');
const { initDb } = require('./database_modules/dbConnection_Mongoose');

//create server
const app = express();

//init DB and Models
initDb().then( () => logger.info('database initiated successfully')).catch( err => logger.info('Db not init: ' + err));

// view engine setup
//environmental variables TODO: define later
app.set('port', process.env.PORT || 3000)
app.set('views', path.join(__dirname, 'views'));
//app.set('view engine', 'pug');

const limit = rateLimit({
  max: 100,// max requests
  windowMs: 60 * 60 * 1000, // 1 Hour
  message: 'Too many requests (max 100) within 1 hour' // message to send
});

//app.use(morgan('dev'));
// Where 1.0.0.0 is the IP address of your Proxy
//app.set(‘trust proxy’, ‘1.0.0.0’);
app.use(helmet());
// Data Sanitization against XSS attacks
app.use(xss());
// Data Sanitization against NoSQL Injection Attacks
app.use(mongoSanitize());
app.use(morgan('combined', { stream: logger.stream }));
app.use(express.json({ limit: '100kb' }));//preventing DOS attack

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add a health check route in express
app.get('/_health', (req, res) => {
  res.status(200).send('ok');
})

//router
app.use('/cds-services', limit, cdsServicesRouter);

// catch 404 and forward to error handler
//app.use(function(req, res, next) {
  //next(createError(404));
//});

//cleanup action before app exits
process.stdin.resume();//so the program will not close instantly

function exitHandler(options, exitCode) {
    if (options.cleanup) logger.info('clean');
    if (exitCode || exitCode === 0) logger.info(`exit code: ` + exitCode);
    if (options.exit) process.exit();
}

// error handler for development and production
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  //if env is dev then return error otherwise empty object
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  logger.error({status: err.status || 500,
   message: err.message || 'no messagge',
  stack: err.stack || 'no stack',
config: err.config || 'no config',
  originalUrl: req.originalUrl || 'none',
  method: req.method || 'no method',
  ip: req.ip || 'no ip',
body_of_message: req.body || 'no request body'});
   // ${err.status || 500} - ${err.message} - ${err.stack}  - ${ (err.config)?JSON.stringify(err.config): 'no config error' } - ${req.originalUrl} - ${req.method}  - ${req.ip} - ${JSON.stringify(req.body)}`);
 
  // render the error page
  //res.status(err.status || 500);
  handleError(err, res);
  //res.json({error: err.message});
});

module.exports = app; //DEBUG=dss-road2h:* npm run devstart