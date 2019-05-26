const dgram = require('dgram');
const server = dgram.createSocket('udp4');
// const tls = require('tls');
const functions = require('./functions.js');
const getConfig = require('./file-config');
const TlsClient = require('./tls-client');

// ToDo Implement errors handling (try & catch in function body may be not the best approach)

// ToDo Implement check for circular references in readDomainName by "192" compression loops

// ToDo check if compose DNS message with root domain functions properly

// ToDo implement forging requests TTL per host

// ToDo implement IPv6?

// ToDo implement other major DNS types & classes?

// ToDo change question.domainName to qname, for proper semantics

(async function() {

    const settings = await getConfig();
    const config = settings.config;

    const upstreamDnsIP = config.upstreamDnsIP;
    const localDnsPort = config.localDnsPort;
    const upstreamDnsPort = config.upstreamDnsPort;
    const forgedRequestsTTL = config.forgedRequestsTTL;

    const localRequestsAwaiting = new Map();

    let remoteTlsClient;

    if (config.remoteDnsConnectionMode == "tls") {
        const options = {
            port: config.upstreamDnsTlsPort,
            host: config.upstreamDnsTlsHost
        }

        const onData = (data) => {
            console.log("data gotten over TLS connection:", data);

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
                    const respData = functions.parseDnsMessageBytes(respBuf);

                    console.log(respData);

                    const requestKey = functions.getRequestIdentifier(respData);
                    const localResponseParams = localRequestsAwaiting.get(requestKey);
                    localRequestsAwaiting.delete(requestKey);

                    server.send(respBuf, localResponseParams.port, localResponseParams.address, (err, bytesNum) => {});

                    dataCurrentPos += 2 + respLen;
                }
            }
            catch (err) {
                console.log();
                console.group();
                console.error(err);
                console.log('DNS response binary data:')
                console.log(functions.binDataToString(data));
                console.groupEnd();
                console.log();

                // while in development, throw error after logging, for not to miss it
                throw err;
            }
        };

        remoteTlsClient = new TlsClient(options, onData);
    }


    server.on('error', (err) => {
      console.log(`server error:\n${err.stack}`);
      server.close();
    });

    server.on('message', async (localReq, linfo) => {
        const dnsRequest = functions.parseDnsMessageBytes(localReq);

        // ToDo as multiple questions per query are not supported,
        // then should then support rejecting such requests, or serve just first question like Google DNS does?

        const question = dnsRequest.questions[0];   // currently, only one question per query is supported by DNS implementations

        let forgingHostParams = undefined;

        for (let i = 0; i < config.requestsToForge.length; i++) {
            const requestToForge = config.requestsToForge[i];
            const targetDomainName = requestToForge.hostName;

            if (functions.domainNameMatchesTemplate(question.domainName, targetDomainName)
                && question.qclass === 1
                && (question.qtype === 1 || question.qtype === 5)) {
                forgingHostParams = requestToForge;
                break;
            }
        }

        if (!!forgingHostParams) {
            const forgeIp = forgingHostParams.ip;
            const forgeCNAME = forgingHostParams.cname;
            const answers = [];

            if (forgeIp) {
                answers.push({
                    domainName: question.domainName,
                    type: question.qtype,   // 1
                    class: question.qclass,
                    ttl: forgedRequestsTTL,
                    rdlength: 4,
                    rdata_bin: functions.ip4StringToBuffer(forgeIp),
                    IPv4: forgeIp
                });
            }
            else if (forgeCNAME) {
                const rdata = functions.writeDomainNameToBuf(forgeCNAME);
                const rdlength = rdata.length;

                answers.push({
                    domainName: question.domainName,
                    type: 5,    // type CNAME
                    class: question.qclass,
                    ttl: forgedRequestsTTL,
                    rdlength: rdlength,
                    rdata_bin: rdata
                    // IPv4: forgeIp
                });

                // ToDo here should be returned an up-level (either forged) answer for CNAME domain
                // answers.push({
                //     domainName: question.domainName,
                //     type: question.qtype,   // 1
                //     class: question.qclass,
                //     ttl: forgedRequestsTTL,
                //     rdlength: 4,
                //     rdata_bin: functions.ip4StringToBuffer('127.0.0.3'),
                //     IPv4: '127.0.0.3'
                // });
            } else {
                // throw exception
                throw new Execption(
                    'For ' + question.domainName + ' should be specified '
                    + '\'ip\' either \'cname\' field in config'
                );
            };


            const localDnsResponse = {
                ID: dnsRequest.ID,
                QR: dnsRequest.QR,
                Opcode: dnsRequest.Opcode,
                AA: dnsRequest.AA,
                TC: false,      // dnsRequest.TC,
                RD: dnsRequest.RD,
                // RA: true,       // ToDo should it be some more complex logic here, rather then simply setting to 'true'?
                RA: false,       // ToDo should it be some more complex logic here, rather then simply setting to 'true'?
                Z: dnsRequest.Z,
                RCODE: 0,       // dnsRequest.RCODE,    0 - no errors, look in RFC-1035 for other error conditions
                QDCOUNT: dnsRequest.QDCOUNT,
                ANCOUNT: answers.length,
                NSCOUNT: dnsRequest.NSCOUNT,
                ARCOUNT: dnsRequest.ARCOUNT,
                questions: dnsRequest.questions,
                answers: answers
            }

            const responseBuf = functions.composeDnsMessageBin(localDnsResponse);

            console.log('response composed for: ', localDnsResponse.questions[0]);
            server.send(responseBuf, linfo.port, linfo.address, (err, bytes) => {});
        }
        else {

            if (config.remoteDnsConnectionMode == "udp") {
                //  transmit binary request and response transparently
                const responseBuf = await functions.getRemoteDnsResponseBin(localReq, upstreamDnsIP, upstreamDnsPort);
                server.send(responseBuf, linfo.port, linfo.address, (err, bytes) => {
                    // add some logic, maybe?
                });
            }
            else if (config.remoteDnsConnectionMode == "tls") {
                const localReqParams = {
                    domainName: dnsRequest.questions[0].domainName,
                    address: linfo.address,
                    port: linfo.port
                };

                const requestKey = functions.getRequestIdentifier(dnsRequest);
                localRequestsAwaiting.set(requestKey, localReqParams);

                const lenBuf = Buffer.alloc(2);
                lenBuf.writeUInt16BE(localReq.length);
                const prepReqBuf = Buffer.concat([lenBuf, localReq], 2 + localReq.length);

                // // remoteTlsClient.write(lenBuf);
                // // remoteTlsClient.write(localReq);
                remoteTlsClient.write(prepReqBuf);   // as of RFC-7766 p.8, length bytes and request data should be send in single "write" call
            }
        }
    });

    server.on('listening', () => {
      const address = server.address();
      console.log(`server listening ${address.address}:${address.port}`);
    });

    server.bind(localDnsPort, 'localhost');
    // server listening 0.0.0.0:53
}());
