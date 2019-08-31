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
        throw new Error('Error: buffers does not match');
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

    const onData = functions.processIncomingDataAndEmitEvent;

    const tlsClient = new TlsClient(tlsOptions, onData);

    const responseMessageFields = await functions.getRemoteDnsTlsResponseBin(dnsMessageFields, tlsClient);

    const socket = tlsClient.getSocket();

    // Socket closes asynchronously, so 'socket closed' console message
    // may appear not exactly in this test, but after some period of time and other tests pass
    socket.end(null, null, () => { console.log('async DNS request: socket closed!') });

    console.log();
    console.log('Async DNS request as function');
    console.log("Got upstream DNS response:");
    console.log(responseMessageFields);
    console.log();
    return;
})();


(function() {

    // DNS response on cname request
    const buf = Buffer.from([
        0, 65, 129, 128, 0, 1, 0, 2,
        0, 0, 0, 0, 4, 119, 119, 119,
        119, 9, 107, 111, 108, 111, 107,
        111, 108, 111, 118, 3, 112, 114,
        111, 0, 0, 1, 0, 1, 192, 12, 0,
        5, 0, 1, 0, 0, 1, 43, 0, 2, 192,
        17, 192, 17, 0, 1, 0, 1, 0, 0,
        1, 43, 0, 4, 5, 188, 232, 60
    ]);

    const messageFields = functions.parseDnsMessageBytes(buf);

    console.log();
    console.log('CNAME response:');
    console.log(messageFields);
    console.log();
})();


// match target hostname pattern with requested one
(function() {
    console.log();
    console.log('Match target hostname pattern with requested one');

    function testPatterns(testValue, pattern, estimatedResult) {
        const reg = functions.makeRegexOfPattern(pattern);

        const isMatch = functions.domainNameMatchesTemplate(testValue, reg);
        console.log(
`Match hostname '${testValue}' and pattern ${pattern}}:
    estimated: ${estimatedResult}, returned: ${isMatch}`
        );
        if (isMatch !== estimatedResult) {
            throw new Error(
`FAIL domainNameMatchesTemplate():
    value: '${testValue}', pattern: '${pattern}', estimated: ${estimatedResult}, returned: ${isMatch}`
            );
        }
    }

    testPatterns('example.com', 'example.com', true);
    testPatterns('Example.COM', 'example.com', true);
    testPatterns('.example.com', '*.example.com', true);
    testPatterns('example.com', 'example*', true);
    testPatterns('www.example.com', 'example*', false);
    testPatterns('www.example.com', '*example*', true);
    testPatterns('www.example.com.ru', '*example*', true);
    testPatterns('www.test.example.com.ru', 'www.*example.com*', true);
    testPatterns('example.com', '*.example.com', false);
    testPatterns('example.com', '*example.com', true);
    testPatterns('.example.com', '*example.com', true);

    console.log('Match target hostname pattern with requested one passed!');
    console.log();
})();
