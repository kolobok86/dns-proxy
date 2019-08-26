// nodejs modules https://nodejs.org/api/modules.html

/** ToDo add normal jsdoc descriptions


*/

// const settings = require('./settings.js');
// const UPSTREAM_DNS_IP = settings.upstreamDnsIP;
// const UPSTREAM_DNS_PORT = settings.upstreamDnsPort;

const dgram = require('dgram');
const myEmitter = require('./event-emitter');

// const EventEmitter = require('events');
// class MyEmitter extends EventEmitter {}


exports.readDomainName = readDomainName;
exports.writeDomainNameToBuf = writeDomainNameToBuf;
exports.parseDnsMessageBytes = parseDnsMessageBytes;
exports.composeDnsMessageBin = composeDnsMessageBin;
exports.getRemoteDnsResponseBin = getRemoteDnsResponseBin;
exports.getRemoteDnsResponseFields = getRemoteDnsResponseFields;
exports.ip4StringToBuffer = ip4StringToBuffer;
exports.domainNameMatchesTemplate = domainNameMatchesTemplate;
exports.getRequestIdentifier = getRequestIdentifier;
exports.binDataToString = binDataToString;
exports._getRemoteDnsTlsResponseBin = _getRemoteDnsTlsResponseBin;
exports.getRemoteDnsTlsResponseBin = getRemoteDnsTlsResponseBin;
exports.processIncomingDataAndEmitEvent = processIncomingDataAndEmitEvent;

const REMOTE_DNS_RESPONSE_TIMEOUT = 3000;

const blankMessageFields = {
    ID: 0,
    QR: false,
    Opcode: 0,
    AA: false,
    TC: false,
    RD: true,
    RA: false,
    Z: 0,
    RCODE: 0,
    QDCOUNT: 0,
    ANCOUNT: 0,
    NSCOUNT: 0,
    ARCOUNT: 0,
    questions: [
        {
            domainName: '',
            qtype: 1,
            qclass: 1
        }
    ],
    answers: [
        {
            domainName: '',
            type: 1,
            class: 1,
            ttl: 299,
            rdlength: 4,
            rdata_bin: Buffer.from([0x255, 0x255, 0x255, 0x255]),
            IPv4: '255.255.255.255'
        }
    ]
}

function readDomainName (buf, startOffset, objReturnValue = {}) {
    let currentByteIndex = startOffset;     // index of byte in buffer, which is currently read
    let initOctet = buf.readUInt8(currentByteIndex);
    let domain = '';
    // for case of "root" domain, i.e. when initOctet is 0, therefore domain name is empty sting;
    // "the root domain name has no labels." (c) RFC-1035, p. 4.1.4. Message compression
    objReturnValue['endOffset'] = currentByteIndex;

    // const mask_pointerDistinguisher = 0b11000000;           // RFC 1035 p.4.1.4. Message compression

    // if((initOctet & mask_pointerDistinguisher) === 192) {     // we're dealing with Message compression
    //     // ToDo simplify it like that: if (initOctet >= 192) {
    //     //      const pointer = buf.readUInt16(currentByteIndex) - 49152);  // 49152 === 0b1100 0000 0000 0000 === 192 * 256
    //     // }

    //     const mask_pointerDistinguisherNegate = 0b00111111;
    //     const pointerHigherPart = initOctet & mask_pointerDistinguisherNegate;   // say, it is 0b11000011, so we take 00000011 part only, two first bits do not count
    //     const pointerLowerPart = buf.readUInt8(currentByteIndex + 1);

    //     let pointer = pointerHigherPart * 256 + pointerLowerPart;     // so if we have bytes 11000011 00001111, then we get 0000001100001111 number as pointer to domain name

    //     // if we're dealing with compression and pointer to domain name,
    //     // then endOffset will be the byte index next to current byte with 0b 1100 0000,
    //     // and that we should return to code which invokes this method
    //     domain = readDomainName(buf, pointer);
    //     objReturnValue['endOffset'] = currentByteIndex + 1;
    //     return domain;
    // };

    // otherwise, initOctet simply represents length for next label
    let lengthOctet = initOctet;
    while (lengthOctet > 0) {
        var label;
        if (lengthOctet >= 192) {   // it is compression pointer 0b1100 0000 or greater
            const pointer = buf.readUInt16BE(currentByteIndex) - 49152;  // 49152 === 0b1100 0000 0000 0000 === 192 * 256
            const returnValue = {}
            label = readDomainName(buf, pointer, returnValue);

            domain +=  ('.' + label);

            objReturnValue['endOffset'] = currentByteIndex + 1;
            // compression part always finishes labels sequence, so here we quit the loop
            // return domain;
            break;
        }
        else {
            currentByteIndex++;
            label = buf.toString('ascii', currentByteIndex, currentByteIndex + lengthOctet);
            domain +=  ('.' + label);

            currentByteIndex += lengthOctet;
            lengthOctet = buf.readUInt8(currentByteIndex);
            objReturnValue['endOffset'] = currentByteIndex;
        }
    }

    return domain.substring(1);     // rid of first "."
}

/**
 * Returns buffer containing given domain name in DNS representation,
 * i.e. 'label_length label_itself', with trailing 0
 * @param {string} domainName
 */
function writeDomainNameToBuf (domainName) {
    const labels = domainName.split('.');

    const buf = Buffer.alloc(domainName.length + 2);

    let bufPos = 0;
    for (let i = 0; i < labels.length; i++) {
        buf.writeUInt8(labels[i].length, bufPos);
        bufPos++;
        buf.write(labels[i], bufPos, 'ascii');
        bufPos = bufPos + labels[i].length;
    }
    buf.writeUInt8(0, bufPos);

    return buf;
}


function parseDnsMessageBytes (buf) {
    const msgFields = {};

    // (c) RFC 1035 p. 4.1.1. Header section format
    msgFields['ID'] = buf.readUInt16BE(0);

    const byte_2 = buf.readUInt8(2);                // byte #2 (starting from 0)
    const mask_QR = 0b10000000;
    msgFields['QR'] = !!(byte_2 & mask_QR);         // 0 "false" => query, 1 "true" => response

    const mask_Opcode = 0b01111000;
    const opcode = (byte_2 & mask_Opcode) >>> 3;    // meaningful values (dec): 0, 1, 2, others reserved
    msgFields['Opcode'] = opcode;

    const mask_AA = 0b00000100;
    msgFields['AA'] = !!(byte_2 & mask_AA);

    const mask_TC = 0b00000010;
    msgFields['TC'] = !!(byte_2 & mask_TC);

    const mask_RD = 0b00000001;
    msgFields['RD'] = !!(byte_2 & mask_RD);


    const byte_3 = buf.readUInt8(3);                // byte #3
    const mask_RA = 0b10000000;
    msgFields['RA'] = !!(byte_3 & mask_RA);

    const mask_Z = 0b01110000;
    msgFields['Z'] = (byte_3 & mask_Z) >>> 4;       // always 0, reserved

    const mask_RCODE = 0b00001111;
    msgFields['RCODE'] = (byte_3 & mask_RCODE);     // 0 => no error; (dec) 1, 2, 3, 4, 5 - errors, see RFC

    msgFields['QDCOUNT'] = buf.readUInt16BE(4);     // number of entries in question

    msgFields['ANCOUNT'] = buf.readUInt16BE(6);     // number of entries in answer

    msgFields['NSCOUNT'] = buf.readUInt16BE(8);

    msgFields['ARCOUNT'] = buf.readUInt16BE(10);

    let currentByteIndex = 12;  // as Question section starts wrom byte #12 of DNS message
    // (c) RFC 1035 p. 4.1.2. Question section format
    msgFields['questions'] = [];
    for (let qdcount = 0; qdcount < msgFields['QDCOUNT']; qdcount++) {
        const question = {};

        const resultByteIndexObj = { endOffset: undefined };
        const domain = readDomainName(buf, currentByteIndex, resultByteIndexObj);

        currentByteIndex = resultByteIndexObj.endOffset + 1;

        question['domainName'] = domain;

        question['qtype'] = buf.readUInt16BE(currentByteIndex);     // 1 => "A" record
        currentByteIndex += 2;

        question['qclass'] = buf.readUInt16BE(currentByteIndex);    // 1 => "IN", i.e. Internet
        currentByteIndex += 2;

        msgFields['questions'].push(question);
    }

    // (c) RFC 1035 p. 4.1.3. Resource record format
    // Applicable for answer, authority, and additional sections
    ['answer', 'authority', 'additional'].forEach(function(section, i, arr) {
    // ['answer'].forEach(function(section, i, arr) {
        let msgFieldsName, countFieldName;

        // ToDo make these as constants
        switch(section) {
            case 'answer':
                msgFieldsName = 'answers';
                countFieldName = 'ANCOUNT';
                break;
            case 'authority':
                msgFieldsName = 'authorities';
                countFieldName = 'NSCOUNT';
                break;
            case 'additional':
                msgFieldsName = 'additionals';
                countFieldName = 'ARCOUNT';
                break;
        }

        msgFields[msgFieldsName] = [];
        for (let recordsCount = 0; recordsCount < msgFields[countFieldName]; recordsCount++) {
            let record = {};

            const objReturnValue = {};
            const domain = readDomainName(buf, currentByteIndex, objReturnValue);
            currentByteIndex = objReturnValue['endOffset'] + 1;

            record['domainName'] = domain;
            // unlike 'question' section fields, these for answer, authority and additional sections
            // does not have leading 'q' in field name, i.e.: qtype => type, qclass => class, etc.,
            // and have some additional fields comparing to 'question'
            record['type'] = buf.readUInt16BE(currentByteIndex);     // 1 corresponds "A" record, see specs
            currentByteIndex += 2;

            record['class'] = buf.readUInt16BE(currentByteIndex);    // 1 => "IN", i.e. Internet
            currentByteIndex += 2;

            // ttl takes 4 bytes
            record['ttl'] = buf.readUIntBE(currentByteIndex, 4);
            currentByteIndex += 4;

            record['rdlength'] = buf.readUInt16BE(currentByteIndex);
            currentByteIndex += 2;

            // const rdataBinTempBuf = buf.slice(currentByteIndex, currentByteIndex + record['rdlength']);    // creates new buffer SHARING memory with buf
            // record['rdata_bin'] = Buffer.from(rdataBinTempBuf);     // creates new buffer with COPYING data from rdataBinTempBuf

            const rdataBinTempBuf = buf.slice(currentByteIndex, currentByteIndex + record['rdlength']);
            record['rdata_bin'] = Buffer.alloc(record['rdlength'], rdataBinTempBuf);

            if (record['type'] === 1 && record['class'] === 1) {
                // if rdata contains IPv4 address,
                // read IP bytes to string IP representation
                let ipStr = '';
                for (ipv4ByteIndex = 0; ipv4ByteIndex < 4; ipv4ByteIndex++) {
                    ipStr += '.' + buf.readUInt8(currentByteIndex).toString();
                    currentByteIndex++;
                }
                record['IPv4'] = ipStr.substring(1);  // rid of first '.'

            }
            else if (record['type'] === 5 && record['class'] === 1) {
                // CNAME
                record['CNAME'] = readDomainName(buf, currentByteIndex);
                currentByteIndex += record['rdlength'];
            }
            else {
                // just treat drata as raw bin data, do not parse
                currentByteIndex += record['rdlength'];
            }

            msgFields[msgFieldsName].push(record);
        }
    });

    return msgFields;
}

function composeDnsMessageBin(messageFields) {
    const buf = new Buffer.alloc(512);      // UDP message max size is 512 bytes (с) RFC 1035 2.3.4. Size limits
    let currentByteIndex = 0;        // index of byte in buffer, which is currently written

    buf.writeUInt16BE(messageFields.ID, currentByteIndex);
    currentByteIndex += 2;

    let byte_2 = 0b00000000;
    const mask_QR = 0b10000000;
    if (messageFields.QR === true) {
        byte_2 = mask_QR;
    }

    // Opcode is written from 3rd bit,
    // so * 8 shifts it 3 bits left, i.e.: 0b0000 0111 * 0x8 => 0b0011 1000
    // and | is used to "megre" bits of QR and Opcode
    // const mask_Opcode = 0b01111000;
    byte_2 = byte_2 | (messageFields.Opcode * 8);

    // const mask_AA = 0b00000100;
    if (messageFields.AA === true) {
        byte_2 = byte_2 | (1 * 4);      // 1 * 4 => 0b0000 0100
    }

    // const mask_TC = 0b00000010;
    if (messageFields.TC === true) {
        byte_2 = byte_2 | (1 * 2);      // 1 * 2 => 0b0000 0010
    }

    // const mask_RD = 0b00000001;
    if (messageFields.RD === true) {
        byte_2 = byte_2 | 1;            // 0b0000 0001
    }

    buf.writeUInt8(byte_2, currentByteIndex);
    currentByteIndex++;

    let byte_3 = 0b00000000;
    const mask_RA = 0b10000000;
    if (messageFields.RA === true) {
        byte_3 = byte_3 | mask_RA;
    }

    // Z is always 0, reserved for future use (c) RFC 1035 4.1.1. Header section format
    // But let's assign it anyways
    // const mask_Z = 0b01110000;
    byte_3 = byte_3 | (messageFields.Z * 8);        // " * 8 " shifts value 3 bits left

    // const mask_RCODE = 0b00001111;

    byte_3 = byte_3 | messageFields.RCODE;

    buf.writeUInt8(byte_3, currentByteIndex);
    currentByteIndex++;

    buf.writeUInt16BE(messageFields.QDCOUNT, currentByteIndex);
    currentByteIndex += 2;

    buf.writeUInt16BE(messageFields.ANCOUNT, currentByteIndex);
    currentByteIndex += 2;

    buf.writeUInt16BE(messageFields.NSCOUNT, currentByteIndex);
    currentByteIndex += 2;

    buf.writeUInt16BE(messageFields.ARCOUNT, currentByteIndex);
    currentByteIndex += 2;

    messageFields.questions.forEach(question => {
        const labelsArr = question.domainName.split('.');
        labelsArr.forEach(label => {
            const labelLength = label.length;
            buf.writeUInt8(labelLength, currentByteIndex);
            currentByteIndex++;

            buf.write(label, currentByteIndex, labelLength, 'ascii');
            currentByteIndex += labelLength;
        });
        // '0' label length designates that domain name writing is completed
        buf.writeUInt8(0, currentByteIndex);
        currentByteIndex++;

        buf.writeUInt16BE(question.qtype, currentByteIndex);
        currentByteIndex += 2;

        buf.writeUInt16BE(question.qclass, currentByteIndex);
        currentByteIndex += 2;
    });


    ['answers', 'authorities', 'additionals'].forEach(function(section, i, arr) {
        if (messageFields[section]) {

            messageFields[section].forEach(sectionItem => {
                const labelsArr = sectionItem.domainName.split('.');
                labelsArr.forEach(label => {
                    const labelLength = label.length;
                    buf.writeUInt8(labelLength, currentByteIndex);
                    currentByteIndex++;

                    buf.write(label, currentByteIndex, labelLength, 'ascii');
                    currentByteIndex += labelLength;
                });
                // '0' label length designates that domain name writing is completed
                buf.writeUInt8(0, currentByteIndex);
                currentByteIndex++;

                buf.writeUInt16BE(sectionItem.type, currentByteIndex);
                currentByteIndex += 2;

                buf.writeUInt16BE(sectionItem.class, currentByteIndex);
                currentByteIndex += 2;

                buf.writeUInt32BE(sectionItem.ttl, currentByteIndex);
                currentByteIndex += 4;      // TTL is 32 bits

                buf.writeUInt16BE(sectionItem.rdlength, currentByteIndex);
                currentByteIndex += 2;

                sectionItem.rdata_bin.copy(buf, currentByteIndex, 0, sectionItem.rdata_bin.length);
                currentByteIndex += sectionItem.rdata_bin.length;
            });
        }

    });

    //  buffer <=> arrayBuffer (c) https://stackoverflow.com/a/12101012,
    //      https://stackoverflow.com/a/31394257/1375574
    const bufEventual = Buffer.from(buf.buffer, 0, currentByteIndex);   // currentByteIndex here is not next byte to read, but merely length of buffer area to copy
    return bufEventual;
}

// ToDo should params order be: binBuf, IP, Port, or should it be binBuf, Port, IP like it is in client.send(.....)?
// async function getRemoteDnsResponseBin(dnsMessageBin, remoteIP = UPSTREAM_DNS_IP, remotePort = UPSTREAM_DNS_PORT) {
async function getRemoteDnsResponseBin(dnsMessageBin, remoteIP, remotePort) {
    var client = dgram.createSocket("udp4");

    client.on('error', function(e) {
        throw e;
    });

    const promise = new Promise((resolve, reject) => {
        // Set timeout to clear client and related event listener after
        const timeoutId = setTimeout(
            () => {
                client.close();
                reject(new Error(`Remote DNS over UDP timeout ${REMOTE_DNS_RESPONSE_TIMEOUT} ms`))
            },
            REMOTE_DNS_RESPONSE_TIMEOUT
        );

        client.on("message", function (msg, rinfo) {
            clearTimeout(timeoutId);
            client.close();
            resolve(msg);
        });

        client.send(dnsMessageBin, remotePort, remoteIP, function(err, bytesCount) {});
    }).then((msg) => { return msg });

    return promise;
}


// #region
// First version of function
async function _getRemoteDnsTlsResponseBin(dnsMessageFields, remoteTlsClient) {

    const requestKey = getRequestIdentifier(dnsMessageFields);

    const lenBuf = Buffer.alloc(2);
    const dnsMessageBuf = composeDnsMessageBin(dnsMessageFields);
    lenBuf.writeUInt16BE(dnsMessageBuf.length);
    const prepReqBuf = Buffer.concat([lenBuf, dnsMessageBuf], 2 + dnsMessageBuf.length);

    remoteTlsClient.write(prepReqBuf);   // as of RFC-7766 p.8, length bytes and request data should be send in single "write" call

    const socket = remoteTlsClient.getSocket();

    const promise = new Promise((resolve, reject) => {
        socket.on('data',
            (data) => {
                console.log("data gotten over TLS connection in async function:", data);

                // Process the case if server responds with several DNS response messages in one TCP or TLS response,
                // so that each DNS response message will arrive in a view: 2 bytes message length, then message bytes themselves.
                // Though, not clear for me yet, if server may respond with several DNS response messages in single TCP or TLS message
                // in practise.
                // ToDo how to test it? Didn't meet such case yet.
                let dataCurrentPos = 0;
                try {
                    while (dataCurrentPos < data.length) {
                        const respLen = data.readUInt16BE(dataCurrentPos);
                        console.log('response length:', respLen);

                        respBuf = data.slice(dataCurrentPos + 2, dataCurrentPos + 2 + respLen);
                        const respData = parseDnsMessageBytes(respBuf);

                        console.log(respData);

                        const requestKey_resp = getRequestIdentifier(respData);

                        if (requestKey == requestKey_resp) {
                            resolve(respData);
                            return;
                        }

                        dataCurrentPos += 2 + respLen;
                    }
                }
                catch (err) {
                    console.log();
                    console.group();
                    console.error(err);
                    console.log('DNS response binary data:')
                    console.log(binDataToString(data));
                    console.groupEnd();
                    console.log();

                    // while in development, throw error after logging, for not to miss it
                    // throw err;
                    reject(err);
                }
            }
        )
    }).then((msg) => { return msg });

    return promise;
}
// #endregion


/**
 * Should be used in conjunction with getRemoteDnsTlsResponseBin(dnsMessageFields, remoteTlsClient),
 * where remoteTlsClient has processIncomingDataAndEmitEvent(data) set as onData callback.
 */
// const onData = (data) => {
function processIncomingDataAndEmitEvent(data) {
    // console.log("data gotten over TLS connection in async function v2:", data);

    // Process the case if server responds with several DNS response messages in one TCP or TLS response,
    // so that each DNS response message will arrive in a view: 2 bytes message length, then message bytes themselves.
    // Though, not clear for me yet, if server may respond with several DNS response messages in single TCP or TLS message
    // in practise.
    // ToDo how to test it? Didn't meet such case yet.
    let dataCurrentPos = 0;
    try {
        while (dataCurrentPos < data.length) {
            const respLen = data.readUInt16BE(dataCurrentPos);
            respBuf = data.slice(dataCurrentPos + 2, dataCurrentPos + 2 + respLen);
            const respData = parseDnsMessageBytes(respBuf);

            const requestKey_resp = getRequestIdentifier(respData);
            myEmitter.emit('remote_tls_data_gotten', requestKey_resp, respBuf, respData);

            dataCurrentPos += 2 + respLen;
        }

        return;
    }
    catch (err) {
        console.log();
        console.group();
        console.error(err);
        console.log('DNS response binary data:')
        console.log(binDataToString(data));
        console.groupEnd();
        console.log();

        // while in development, throw error after logging, for not to miss it
        // throw err;
    }
}


async function getRemoteDnsTlsResponseBin(dnsMessageFields, remoteTlsClient) {
    const requestKey = getRequestIdentifier(dnsMessageFields);

    const lenBuf = Buffer.alloc(2);
    const dnsMessageBuf = composeDnsMessageBin(dnsMessageFields);
    lenBuf.writeUInt16BE(dnsMessageBuf.length);
    const prepReqBuf = Buffer.concat([lenBuf, dnsMessageBuf], 2 + dnsMessageBuf.length);

    remoteTlsClient.write(prepReqBuf);   // as of RFC-7766 p.8, length bytes and request data should be send in single "write" call

    const promise = new Promise((resolve, reject) => {
        myEmitter.on('remote_tls_data_gotten', (requestKey_resp, respBuf, respData) => {
            // Set timeout to clear event listener after
            const timeoutId = setTimeout(
                () => {
                    reject(new Error(`Remote DNS over TLS timeout ${REMOTE_DNS_RESPONSE_TIMEOUT} ms`))
                },
                REMOTE_DNS_RESPONSE_TIMEOUT
            );

            if (requestKey_resp === requestKey) {
                clearTimeout(timeoutId)
                resolve(respBuf);
            }
        })
    }).then((respBuf) => {
        return respBuf
    });

    return promise;
}


// ToDo should params order be: binBuf, IP, Port, or should it be binBuf, Port, IP like it is in client.send(.....)?
// async function getRemoteDnsResponseFields(requestMessageFields, remoteIP = UPSTREAM_DNS_IP, remotePort = UPSTREAM_DNS_PORT) {
async function getRemoteDnsResponseFields(requestMessageFields, remoteIP, remotePort) {
    const requestMessageBin = composeDnsMessageBin(requestMessageFields);
    const responseMessageBin = await getRemoteDnsResponseBin(requestMessageBin, remoteIP, remotePort);
    const responseMessageFields = parseDnsMessageBytes(responseMessageBin);
    return responseMessageFields;
}

// ToDo add tests
function ip4StringToBuffer(ipStr) {
    const literalsArr = ipStr.split('.');
    const numsArr = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        numsArr[i] = Number(literalsArr[i]);
    }
    const buf = Buffer.from(numsArr);
    return buf;
}

// ToDo add tests
/**
 * Check if subject domain name matches the domain names defined by template
 * @param {string} subject - domain name to test
 * @param {string} template - template to test domain name over
 */
function domainNameMatchesTemplate(subject, template) {
    // sipmlest generic solution, subject to be improved by wildcards / regex etc.
    return (subject.includes(template));
}

// ToDo probably need implement that
// function ip4BufferToString () {}

function getRequestIdentifier(messageData) {
    const question = messageData.questions[0] || {};
    return `${messageData.ID}_${question.domainName}_${question.qtype}_${question.qclass}`;
}

function binDataToString(data) {
    const arr = [...data];
    const resStr = '[' + arr.join(', ') + ']';
    return resStr;
}
