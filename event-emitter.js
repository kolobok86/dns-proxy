// ToDo cannot TlsClient be used as MyEmitter instead that, as it implements EventEmitter interface?

const EventEmitter = require('events');

class MyEmitter extends EventEmitter {}

const myEmitter = new MyEmitter ();

module.exports = myEmitter;
