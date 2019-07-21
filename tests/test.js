const functions = require('../functions');
const mocks = require('./test_mocks');
const TlsClient = require('../tls-client');


// read domain name
(function() {
    const returnParams = {};
    const domainName = functions.readDomainName(mocks.responseBuffer, 12, returnParams);

    console.log('read domain name test');
    console.log(domainName);
    console.log(returnParams);
    console.log();
})();

// read domain name with compression
(function(){
    const returnParams = {};
    const domainName = functions.readDomainName(mocks.responseBuffer, 49, returnParams);

    console.log('read domain name with compression test');
    console.log(domainName);
    console.log(returnParams);
    console.log();
})();

// read entire DNS message from buffer
(function(){
    const buf = mocks.responseBuffer;
    const dnsMessage = functions.parseDnsMessageBytes(buf);

    console.log('read entire DNS message from buffer test');
    console.log(dnsMessage);
    console.log();
})();

// write domain name to buffer in DNS format
(function() {
    const domainName = 'www.google.com';
    const domainNameBuf = functions.writeDomainNameToBuf(domainName);

    const estimatedBuf = Buffer.from([3, 119, 119, 119, 6, 103, 111, 111, 103, 108, 101, 3, 99, 111, 109, 0]);

    console.log('write domain name to buffer in DNS format test');
    console.log('\t given buffer to estimated buffer:')
    console.log(functions.binDataToString(domainNameBuf));
    console.log(functions.binDataToString(estimatedBuf));

    if (domainNameBuf.equals(estimatedBuf)) {
        console.log('\tPASS: buffers match');
    }
    else {
        throw new Exception('Error: buffers does not match');
    };

    console.log();
})();


// get request key on DNS message fields
(function(){
    const dnsMessageFields = {
        ID: 35733,
        QR: false,
        Opcode: 0,
        AA: false,
        TC: false,
        RD: true,
        RA: false,
        Z: 0,
        // RCODE: 0,
        QDCOUNT: 1,
        ANCOUNT: 0,
        NSCOUNT: 0,
        ARCOUNT: 0,
        questions: [
            {
                domainName: 'google.com',
                qtype: 1,
                qclass: 1
            }
        ]
    }

    const requestKey = functions.getRequestIdentifier(dnsMessageFields);

    console.log("Get request key on DNS message fields");
    console.log(requestKey);
    console.log();
})();


// compose binary DNS message from message object
(function(){
    const bufInit = mocks.responseBuffer;
    const dnsMessageObj = functions.parseDnsMessageBytes(bufInit);
    const bufSecondary = functions.composeDnsMessageBin(dnsMessageObj);
    console.log('compose binary DNS message from message object');
    console.log(bufSecondary);
    console.log();

    const dnsMessageObjSecondary = functions.parseDnsMessageBytes(bufSecondary);
    console.log('parse DNS message fields from secondary binary buffer');
    console.log(dnsMessageObjSecondary);
    console.log();
})();


// Query upstream DNS server with sample binary request

// async DNS request
(async function() {
    const dnsMessageFields = {
        ID: 35733,  // arbitrary value, picked randomly
        QR: false,
        Opcode: 0,
        AA: false,
        TC: false,
        RD: true,
        RA: false,
        Z: 0,
        // RCODE: 0,
        QDCOUNT: 1,
        ANCOUNT: 0,
        NSCOUNT: 0,
        ARCOUNT: 0,
        questions: [
            {
                domainName: 'google.com',
                qtype: 1,
                qclass: 1
            }
        ]
    }

    const tlsOptions = {
        port: 853,
        host: '8.8.8.8'
    }

    const tlsClient = new TlsClient(tlsOptions);


    const responseMessageFields = await functions.getRemoteDnsTlsResponseBin(dnsMessageFields, tlsClient);

    console.log();
    console.log('Async DNS request as function');
    console.log("Got upstream DNS response", responseMessageFields);

})();
