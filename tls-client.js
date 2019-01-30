const tls = require('tls');

const TLS_SOCKET_IDLE_TIMEOUT = 30000;   // ms before closing TLS connection

function Module(connectionOptions, funcOnData, funcOnError, funcOnClose, funcOnEnd) {

    let socket;

    function connect() {
        socket = tls.connect(connectionOptions, () => {
            console.log('client connection established:',
            socket.authorized ? 'authorized' : 'unauthorized');
        });

        socket.on('data', funcOnData);

        // connection.on('end', () => {});

        socket.on('close', (hasTransmissionError) => {
            // For now, don't reopen connection if it is closed by remote host.
            // Instead, establish new remote connection on new local request arrives.
            // this.connect();
            console.log('connection closed; transmission error:', hasTransmissionError);
        });

        socket.on('end', () => {
            console.log('remote TLS server connection closed.')
        });

        socket.on('error', (err) => {
            console.log('connection error:', err);
            console.log('\tmessage:', err.message);
            console.log('\tstack:', err.stack);
        })

        socket.setTimeout(TLS_SOCKET_IDLE_TIMEOUT);

        socket.on('timeout', () => {
          console.log('socket idle timeout, disconnected.');
          socket.end();
        });

    }

    // function getConnection() {
    //     if (!socket || !socket.writable) {
    //         connect();
    //     }
    //     return socket;
    // }

    this.write = function (dataBuf) {
        if(socket && socket.writable) {
            //
        }
        else {
            connect();
        }

        socket.write(dataBuf);
    }

    return this;
}

module.exports = Module;
