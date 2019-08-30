const dgram = require('dgram');
const server = dgram.createSocket('udp4');
// const tls = require('tls');
const functions = require('./functions.js');
const getConfig = require('./file-config');
const TlsClient = require('./tls-client');
const EventEmitter = require('events');


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

    let remoteTlsClient;

    if (config.remoteDnsConnectionMode == "tls") {
        const options = {
            port: config.upstreamDnsTlsPort,
            host: config.upstreamDnsTlsHost
        }

        const onData = functions.processIncomingDataAndEmitEvent;
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
                });

                // if request QTYPE is 5 'CNAME', then requester awaits just canonical host name,
                // no need to make further DNS resolve.
                // Otherwise (QTYPE is 1), resolve IP address for canonical hostname from uplevel DNS server
                // and add this data to canonical hostname.
                if (question.qtype === 1) {
                    const remoteRequestFields = {
                        ID: Math.floor((Math.random() * 65535) + 1),
                        QR: false,
                        Opcode: 0,
                        AA: false,
                        TC: false,
                        RD: true,
                        RA: false,
                        Z: 0,
                        RCODE: 0,
                        QDCOUNT: 1,
                        ANCOUNT: 0,
                        NSCOUNT: 0,
                        ARCOUNT: 0,
                        questions: [
                            {
                                domainName: forgeCNAME,
                                qtype: 1,
                                qclass: 1
                            }
                        ]
                    }

                    let remoteResponseBuf;
                    try {
                        if (config.remoteDnsConnectionMode == "udp") {
                            const remoteRequestBin = functions.composeDnsMessageBin(remoteRequestFields);
                            remoteResponseBuf = await functions.getRemoteDnsResponseBin(remoteRequestBin, upstreamDnsIP, upstreamDnsPort);
                        }
                        else if (config.remoteDnsConnectionMode == "tls") {
                            remoteResponseBuf = await functions.getRemoteDnsTlsResponseBin(remoteRequestFields, remoteTlsClient);
                        }
                    } catch (error) {
                        console.error(error.message);
                    }

                    const remoteResponseFields = functions.parseDnsMessageBytes(remoteResponseBuf);
                    remoteResponseFields.answers.forEach( answer => {
                        answers.push(answer);
                    });
                }

            } else {
                // throw exception
                // throw new Error(
                //     'For ' + question.domainName + ', should be specified '
                //     + '\'ip\' either \'cname\' field in config'
                // );
                console.warn(
                    'For ' + question.domainName + ', \'ip\' either \'cname\' field should be specified in config.json'
                );
            };


            const localDnsResponse = {
                ID: dnsRequest.ID,
                QR: true,
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
                ARCOUNT: 0,     // we don't provide records in additional section in this case
                questions: dnsRequest.questions,
                answers: answers
            }

            console.log();
            console.log('Prepared local DNS response:');
            console.log(localDnsResponse);
            console.log();


            const responseBuf = functions.composeDnsMessageBin(localDnsResponse);

            console.log('response composed for: ', localDnsResponse.questions[0]);
            server.send(responseBuf, linfo.port, linfo.address, (err, bytes) => {});
        }
        else {

            try {
                if (config.remoteDnsConnectionMode == "udp") {
                    //  transmit binary request and response transparently
                    const responseBuf = await functions.getRemoteDnsResponseBin(localReq, upstreamDnsIP, upstreamDnsPort);
                    server.send(responseBuf, linfo.port, linfo.address, (err, bytes) => {
                        // add some logic, maybe?
                    });
                }
                else if (config.remoteDnsConnectionMode == "tls") {
                    const responseBuf = await functions.getRemoteDnsTlsResponseBin(dnsRequest, remoteTlsClient);
                    server.send(responseBuf, linfo.port, linfo.address, (err, bytes) => {
                        // add some logic, maybe?
                    });
                }
            } catch (error) {
                console.error(error.message);
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
